'use strict';

function isMissingNewRelicPackage(error) {
  return (
    error &&
    typeof error === 'object' &&
    error.code === 'MODULE_NOT_FOUND' &&
    typeof error.message === 'string' &&
    error.message.includes("Cannot find module 'newrelic'")
  );
}

try {
  require('newrelic');
} catch (error) {
  if (!isMissingNewRelicPackage(error)) {
    throw error;
  }
}
