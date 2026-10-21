/* Native lifecycle + Android back button. Does nothing in a normal browser. */
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var App = C.Plugins && C.Plugins.App;
  function abortRound() {   // app left the foreground mid-round: the hidden timer would be meaningless
    try { if (state === 'playing') { setState('menu'); setMood('idle'); } } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) abortRound(); });
  if (!App) return;
  App.addListener('appStateChange', function (s) { if (!s.isActive) abortRound(); });
  App.addListener('backButton', function () {
    try {
      if (state === 'results') toMenu();           // results -> menu
      else if (state === 'menu') App.exitApp();    // menu -> leave app
      /* playing / reveal: ignored so a stray swipe cannot cancel a round */
    } catch (e) {}
  });
})();
