var monitorFn = require('..').monitorLoader;

var monitorSrc = `(${monitorFn.toString()})()`;

module.exports = function() {
  return monitorSrc;
};
