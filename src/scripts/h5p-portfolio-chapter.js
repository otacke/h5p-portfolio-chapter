import Util from './h5p-portfolio-chapter-util';
import '../styles/h5p-portfolio-chapter.scss';

export default class PortfolioChapter extends H5P.EventDispatcher {
  /**
   * @constructor
   * @param {object} params Parameters passed by the editor.
   * @param {number} contentId Content's id.
   * @param {object} [extras] Saved state, metadata, etc.
   */
  constructor(params, contentId, extras = {}) {
    super();

    // Sanitize parameters
    this.params = Util.extend({
      chapter: {
        contents: []
      }
    }, params);

    this.params = this.params.chapter;

    this.contentId = contentId;
    this.extras = extras;

    this.previousState = extras?.previousState || {};

    const defaultLanguage = extras?.metadata?.defaultLanguage || 'en';
    this.languageTag = Util.formatLanguageCode(defaultLanguage);

    while (this.params.contents.length < 1) {
      this.params.contents.push({});
    }

    // Build contents
    this.contents = this.buildContents({
      contents: this.params.contents,
      previousStates: this.previousState.children || []
    });

    // Some other content types might use this information
    this.isTask = this.contents.some(
      content => this.isInstanceTask(content.instance)
    );

    // Expect parent to set activity started when parent is shown
    if (typeof this.isRoot === 'function' && this.isRoot()) {
      this.setActivityStarted();
    }
  }

  /**
   * Attach library to wrapper.
   * @param {jQuery} $wrapper Content's container.
   */
  attach($wrapper) {
    $wrapper.get(0).classList.add('h5p-portfolio-chapter');
    $wrapper.get(0).appendChild(this.buildDOM());

    // Make sure DOM has been rendered with content
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        this.trigger('resize');
      });
    });
  }

  /**
   * Build contents including DOM and H5P instances.
   * @param {object} params Parameters.
   * @param {object[]} params.contents Content parameters.
   * @param {object[]} params.previousStates Previous states.
   * @return {object[]} Contents including DOM and instance.
   */
  buildContents(params = {}) {
    const contents = (params.contents || []).map((content, index) => {
      const dom = this.buildContentWrapper();

      const previousState = params?.previousStates.length > index ?
        params.previousStates[index] :
        {};

      const instance = (!content.content) ?
        null :
        H5P.newRunnable(
          content.content,
          this.contentId,
          H5P.jQuery(dom),
          false,
          { previousState: previousState }
        );

      // Resize instance to fit inside parent and vice versa
      if (instance) {
        this.bubbleDown(this, 'resize', [instance]);
        this.bubbleUp(instance, 'resize', this);

        if (this.isInstanceTask(instance)) {
          instance.on('xAPI', event => {
            this.trackScoring(event, index);
          });
        }
      }

      return {
        dom: dom,
        instance: instance,
        isDone: !instance || !this.isInstanceTask(instance)
      };
    });

    return contents;
  }

  /**
   * Build DOM.
   * @return {HTMLElement} Content DOM.
   */
  buildDOM() {
    const contents = document.createElement('div');
    contents.classList.add('h5p-portfolio-chapter-contents');

    this.contents.forEach(content => {
      contents.appendChild(content.dom);
    });

    return contents;
  }

  /**
   * Build content wrapper.
   * @return {HTMLElement} Content wrapper.
   */
  buildContentWrapper() {
    const contentWrapper = document.createElement('div');
    contentWrapper.classList.add('h5p-portfolio-chapter-content');

    return contentWrapper;
  }

  /**
   * Make it easy to bubble events from parent to children
   * @param {object} origin Origin of the event.
   * @param {string} eventName Name of the event.
   * @param {object[]} targets Targets to trigger event on.
   */
  bubbleDown(origin, eventName, targets = []) {
    origin.on(eventName, function (event) {
      if (origin.bubblingUpwards) {
        return; // Prevent send event back down.
      }

      targets.forEach(target => {
        target.trigger(eventName, event);
      });
    });
  }

  /**
   * Make it easy to bubble events from child to parent.
   * @param {object} origin Origin of event.
   * @param {string} eventName Name of event.
   * @param {object} target Target to trigger event on.
   */
  bubbleUp(origin, eventName, target) {
    origin.on(eventName, (event) => {

      // Prevent target from sending event back down
      target.bubblingUpwards = true;

      // Trigger event
      target.trigger(eventName, event);

      // Reset
      target.bubblingUpwards = false;
    });
  }

  /**
   * Track scoring of contents.
   */
  trackScoring(event, index = -1) {
    if (!event || event.getScore() === null) {
      return; // Not relevant
    }

    if (index < 0 || index > this.contents.length - 1) {
      return; // Not valid
    }

    this.contents[index].isDone = true;
    if (this.contents.every(content => content.isDone)) {
      this.handleAllContentsDone();
    }
  }

  /**
   * Handle all contents done.
   */
  handleAllContentsDone() {
    // Ensure subcontent's xAPI statement is triggered beforehand
    window.requestAnimationFrame(() => {
      this.triggerXAPIScored(this.getScore(), this.getMaxScore(), 'completed');
    });
  }

  /**
   * Determine whether an H5P instance is a task.
   * @return {boolean} True, if instance is a task.
   */
  isInstanceTask(instance = {}) {
    if (!instance) {
      return false;
    }

    if (instance.isTask) {
      return instance.isTask; // Content will determine if it's task on its own
    }

    // Check for maxScore as indicator for being a task
    const hasGetMaxScore = (typeof instance.getMaxScore === 'function');
    if (hasGetMaxScore) {
      return true;
    }

    return false;
  }

  /**
   * Check if result has been submitted or input has been given.
   * @return {boolean} True, if answer was given.
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-1}
   */
  getAnswerGiven() {
    return this.contents.some(content => {
      return (
        typeof content?.instance?.getAnswerGiven === 'function' &&
        content.instance.getAnswerGiven()
      );
    });
  }

  /**
   * Get score.
   * @return {number} Score.
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-2}
   */
  getScore() {
    return this.contents.reduce((sum, content) => {
      return sum + (typeof content.instance.getScore === 'function' ?
        content.instance.getScore() :
        0);
    }, 0);
  }

  /**
   * Get maximum possible score.
   * @return {number} Maximum possible score.
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-3}
   */
  getMaxScore() {
    return this.contents.reduce((sum, content) => {
      return sum + (typeof content.instance.getMaxScore === 'function' ?
        content.instance.getMaxScore() :
        0);
    }, 0);
  }

  /**
   * Show solutions.
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-4}
   */
  showSolutions() {
    this.contents.forEach(content => {
      if (typeof content?.instance?.showSolutions === 'function') {
        content.instance.showSolutions();
      }
    });

    this.trigger('resize');
  }

  /**
   * Reset task.
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-5}
   */
  resetTask() {
    this.contents.forEach(content => {
      if (typeof content?.instance?.resetTask === 'function') {
        content.instance.resetTask();
      }

      content.isDone = !content.instance || !this.isInstanceTask(content.instance);
    });

    this.trigger('resize');
  }

  /**
   * Get xAPI data.
   * @return {object} XAPI statement.
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-6}
   */
  getXAPIData() {
    var xAPIEvent = this.createXAPIEvent('answered');

    xAPIEvent.setScoredResult(this.getScore(),
      this.getMaxScore(),
      this,
      true,
      this.getScore() === this.getMaxScore()
    );

    return {
      statement: xAPIEvent.data.statement,
      children: this.getXAPIDataFromChildren(
        this.contents.map(content => content.instance)
      )
    };
  }

  /**
   * Get xAPI data from sub content types
   * @param {H5P.ContentType[]} H5P instances.
   * @return {object[]} XAPI data objects used to build report.
   */
  getXAPIDataFromChildren(children) {
    return children
      .map(child => {
        if (typeof child.getXAPIData === 'function') {
          return child.getXAPIData();
        }
      })
      .filter(data => !!data);
  }

  /**
   * Create an xAPI event.
   * @param {string} verb Short id of the verb we want to trigger.
   * @return {H5P.XAPIEvent} Event template.
   */
  createXAPIEvent(verb) {
    const xAPIEvent = this.createXAPIEventTemplate(verb);
    Util.extend(
      xAPIEvent.getVerifiedStatementValue(['object', 'definition']),
      this.getxAPIDefinition());

    return xAPIEvent;
  }

  /**
   * Get the xAPI definition for the xAPI object.
   * @return {object} XAPI definition.
   */
  getxAPIDefinition() {
    const definition = {};

    definition.name = {};
    definition.name[this.languageTag] = this.getTitle();
    // Fallback for h5p-php-reporting, expects en-US
    definition.name['en-US'] = definition.name[this.languageTag];
    definition.description = {};
    definition.description[this.languageTag] = Util.stripHTML(
      this.getDescription()
    );
    // Fallback for h5p-php-reporting, expects en-US
    definition.description['en-US'] = definition.description[this.languageTag];
    definition.type = 'http://adlnet.gov/expapi/activities/cmi.interaction';
    definition.interactionType = 'compound';

    return definition;
  }

  /**
   * Get instances.
   * @return {H5P.ContentType[]} H5P instances.
   */
  getInstances() {
    return this.contents.map(content => content.instance);
  }

  /**
   * Get instances' semantics.
   * @return {object[]} H5P instance semantics.
   */
  getInstancesSemantics() {
    return this.params.contents.map(content => content.content);
  }

  /**
   * Get task title.
   * @return {string} Title.
   */
  getTitle() {
    // H5P Core function: createTitle
    return H5P.createTitle(
      this.extras?.metadata?.title || PortfolioChapter.DEFAULT_DESCRIPTION
    );
  }

  /**
   * Get description.
   * @return {string} Description.
   */
  getDescription() {
    return PortfolioChapter.DEFAULT_DESCRIPTION;
  }

  /**
   * Get current state.
   * @return {object} Current state.
   */
  getCurrentState() {
    return {
      children: this.contents.map(content => {
        return (typeof content?.instance?.getCurrentState === 'function') ?
          content.instance.getCurrentState() :
          {};
      })
    };
  }
}

/** @constant {string} */
PortfolioChapter.DEFAULT_DESCRIPTION = 'Portfolio chapter';