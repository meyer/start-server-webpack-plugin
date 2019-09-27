export const monitorLoader = () => {
  if (!module.hot) {
    // TODO(meyer) send some kind of error here?
    if (process.send) {
      process.send('SSWP_LOADED');
    }
    return;
  }

  // let webpack do its thing
  require('webpack/hot/signal');

  console.log('Handling Hot Module Reloading');

  const checkForUpdate = () => {
    console.log('checking for update....');
    module.hot!.check(true, function(err, updatedModules) {
      if (err) {
        var status = module.hot!.status();
        if (['abort', 'fail'].indexOf(status) >= 0) {
          if (process.send) {
            process.send('SSWP_HMR_FAIL');
          }
          process.exit(222);
        }
      }

      if (!updatedModules) {
        return;
      }

      return module.hot!.apply(
        {
          ignoreUnaccepted: true,
          // TODO probably restart
          // onUnaccepted: data => {},
        },
        err => {
          if (err) {
            console.error('module.hot.apply error:', err);
          }
          checkForUpdate();
        }
      );
    });
  };

  process.on('message', function(message) {
    if (message !== 'SSWP_HMR' || module.hot!.status() !== 'idle') {
      return;
    }
    checkForUpdate();
  });

  // Tell our plugin we loaded all the code without initially crashing
  if (process.send) {
    process.send('SSWP_LOADED');
  }
};
