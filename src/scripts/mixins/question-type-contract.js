/**
 * Mixin containing methods for H5P Question Type contract.
 */
export default class QuestionTypeContract {
  /**
   * Check if result has been submitted or input has been given.
   * @returns {boolean} True, if answer was given.
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-1}
   */
  getAnswerGiven() {
    return this.contents.some((content) => {
      return (
        typeof content?.instance?.getAnswerGiven === 'function' &&
        content.instance.getAnswerGiven()
      );
    });
  }

  /**
   * Get score.
   * @returns {number} Score.
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
   * @returns {number} Maximum possible score.
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
    this.contents.forEach((content) => {
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
    this.contents.forEach((content) => {
      if (typeof content?.instance?.resetTask === 'function') {
        content.instance.resetTask();
      }

      content.isDone = !content.instance || !this.isInstanceTask(content.instance);
    });

    this.trigger('resize');
  }
}
