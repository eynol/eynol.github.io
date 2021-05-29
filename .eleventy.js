const dayjs = require('dayjs')
module.exports = function (eleventyConfig) {

  eleventyConfig.addPassthroughCopy("_css");
  eleventyConfig.addPassthroughCopy("img");
  eleventyConfig.addPassthroughCopy("lib");
  eleventyConfig.addPassthroughCopy("sw.js");

  eleventyConfig.addWatchTarget("sw.js");
  eleventyConfig.addWatchTarget("./css");
  // default is 0

  eleventyConfig.setWatchThrottleWaitTime(100); // in milliseconds
  // or, use a Universal filter (an alias for all of the above)
  eleventyConfig.addFilter("makeUppercase", function (value) { });
  eleventyConfig.addFilter("timeFormat", function (date, format = 'YYYY-MM-DD ddd') {
    if (date instanceof Date) {
      return dayjs(date).format(format)
    }
  });
};