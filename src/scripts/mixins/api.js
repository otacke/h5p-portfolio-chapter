/**
 * Mixin holding API functions for parent content types.
 */
export default class API {
  /**
   * Get instances.
   * @returns {H5P.ContentType[]} H5P instances. Interface for parent.
   */
  getInstances() {
    return this.contents.map((content) => content.instance);
  }

  /**
   * Get instances' semantics.
   * @returns {object[]} H5P instance semantics.
   */
  getInstancesSemantics() {
    return this.params.contents.map((content) => content.content);
  }
}
