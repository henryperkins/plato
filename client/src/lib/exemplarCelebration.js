/** Draw the completion check once, leaving the finished state visible at rest. */
export function celebrateExemplar(check) {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!check?.animate || motion.matches || document.hidden) return () => {};

  const animation = check.animate(
    [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
    { duration: 520, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  );
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    animation.cancel();
    motion.removeEventListener('change', onPreferenceChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
  const onPreferenceChange = () => { if (motion.matches) stop(); };
  const onVisibilityChange = () => { if (document.hidden) stop(); };
  motion.addEventListener('change', onPreferenceChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  animation.onfinish = stop;
  animation.oncancel = stop;
  return stop;
}
