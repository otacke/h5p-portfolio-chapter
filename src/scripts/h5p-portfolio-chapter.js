import Util from '@services/util.js';
import API from '@mixins/api.js';
import QuestionTypeContract from '@mixins/question-type-contract.js';
import XAPI from '@mixins/xapi.js';
import '@styles/h5p-portfolio-chapter.scss';

export default class PortfolioChapter extends H5P.EventDispatcher {
  /**
   * @class
   * @param {object} params Parameters passed by the editor.
   * @param {number} contentId Content's id.
   * @param {object} [extras] Saved state, metadata, etc.
   */
  constructor(params, contentId, extras = {}) {
    super();

    Util.addMixins(
      PortfolioChapter, [API, QuestionTypeContract, XAPI]
    );

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

    // Ensure contents are filled.
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
      (content) => this.isInstanceTask(content.instance)
    );

    // Expect parent to set activity started when parent is shown
    if (typeof this.isRoot === 'function' && this.isRoot()) {
      this.setActivityStarted();
    }
  }

  /**
   * Attach library to wrapper.
   * @param {H5P.jQuery} $wrapper Content's container.
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
   * @returns {object[]} Contents including DOM and instance.
   */
  buildContents(params = {}) {
    const contents = (params.contents || []).map((content, index) => {
      const dom = this.buildContentWrapper();

      // Get previous state, if it exists.
      const previousState = params?.previousStates.length > index ?
        params.previousStates[index] :
        {};

      const instance = this.createChildInstance(
        content, dom, index, previousState
      );

      return {
        dom: dom,
        instance: instance,
        isDone: !instance || !this.isInstanceTask(instance)
      };
    });

    return contents;
  }

  /**
   * Create new instance of content.
   * @param {object} content Content parameters.
   * @param {H5P.jQuery} dom DOM element to attach content to.
   * @param {number} index Index of content.
   * @param {object} [previousState] Previous state
   * @returns {H5P.ContentType|null} H5P content instance.
   */
  createChildInstance(content = {}, dom, index, previousState = {}) {
    // Create new instance, if content exists.
    const instance = (content.content) ?
      H5P.newRunnable(
        content.content,
        this.contentId,
        H5P.jQuery(dom),
        false,
        { previousState: previousState }
      ) :
      null;

    // Resize instance to fit inside parent and vice versa
    if (instance) {
      this.initializeResizeBubbling(instance);

      if (this.isInstanceTask(instance)) {
        instance.on('xAPI', (event) => {
          this.trackScoring(event, index);
        });
      }
    }

    return instance;
  }

  /**
   * Initialize resize bubbling between parent and child.
   * @param {H5P.ContentType} instance H5P content instance
   */
  initializeResizeBubbling(instance) {
    this.bubbleDown(this, 'resize', [instance]);
    this.bubbleUp(instance, 'resize', this);
  }

  /**
   * Build DOM.
   * @returns {HTMLElement} Content DOM.
   */
  buildDOM() {
    const contents = document.createElement('div');
    contents.classList.add('h5p-portfolio-chapter-contents');

    this.contents.forEach((content) => {
      contents.appendChild(content.dom);
    });

    return contents;
  }

  /**
   * Get Placeholder DOMs.
   * @returns {HTMLElement[]} Placeholder DOMs.
   */
  getPlaceholderDOMs() {
    return this.contents.map((content) => content.dom);
  }

  /**
   * Build content wrapper.
   * @returns {HTMLElement} Content wrapper.
   */
  buildContentWrapper() {
    const contentWrapper = document.createElement('div');
    contentWrapper.classList.add('h5p-portfolio-chapter-content');

    return contentWrapper;
  }

  /**
   * Make it easy to bubble events from parent to children.
   * @param {object} origin Origin of the event.
   * @param {string} eventName Name of the event.
   * @param {object[]} targets Targets to trigger event on.
   */
  bubbleDown(origin, eventName, targets = []) {
    origin.on(eventName, function (event) {
      if (origin.bubblingUpwards) {
        return; // Prevent send event back down.
      }

      targets.forEach((target) => {
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
   * @param {Event} event Event.
   * @param {number} [index] Index.
   */
  trackScoring(event, index = -1) {
    if (!event || event.getScore() === null) {
      return; // Not relevant
    }

    if (index < 0 || index > this.contents.length - 1) {
      return; // Not valid
    }

    this.contents[index].isDone = true;
    if (this.contents.every((content) => content.isDone)) {
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
   * @param {H5P.ContentType} instance Instance.
   * @returns {boolean} True, if instance is a task.
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
}
