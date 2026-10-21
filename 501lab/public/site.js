(() => {
  const header = document.querySelector('.site-header');
  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.getElementById('main-navigation');
  const setMenu = open => {
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.querySelector('.menu-label').textContent = open ? '닫기' : '메뉴';
    navigation.classList.toggle('is-open', open);
    header.classList.toggle('menu-is-open', open);
  };
  menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
  navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      menuButton.focus();
    }
  });
  const desktop = window.matchMedia('(min-width:761px)');
  desktop.addEventListener('change', event => { if (event.matches) setMenu(false); });
  const sections = ['research','people','partnership'].map(id => ({
    section: document.getElementById(id),
    link: navigation.querySelector(`a[href="#${id}"]`)
  }));
  let pendingFrame = 0;
  const updateActiveSection = () => {
    pendingFrame = 0;
    header.classList.toggle('is-scrolled', window.scrollY > 32);
    const bandTop = window.innerHeight * .15;
    const bandBottom = window.innerHeight * .55;
    let activeSection = null;
    let largestOverlap = 0;
    sections.forEach(item => {
      const bounds = item.section.getBoundingClientRect();
      const overlap = Math.max(0, Math.min(bounds.bottom, bandBottom) - Math.max(bounds.top, bandTop));
      if (overlap > largestOverlap) {
        largestOverlap = overlap;
        activeSection = item;
      }
    });
    sections.forEach(item => {
      if (item === activeSection) {
        item.link.setAttribute('data-active', '');
        item.link.setAttribute('aria-current', 'location');
      } else {
        item.link.removeAttribute('data-active');
        item.link.removeAttribute('aria-current');
      }
    });
  };
  const scheduleActiveUpdate = () => {
    if (!pendingFrame) pendingFrame = window.requestAnimationFrame(updateActiveSection);
  };
  window.addEventListener('scroll', scheduleActiveUpdate, {passive:true});
  window.addEventListener('resize', scheduleActiveUpdate);
  window.addEventListener('load', scheduleActiveUpdate);
  updateActiveSection();
  const researchSequence = document.querySelector('.research-sequence');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (researchSequence && 'IntersectionObserver' in window && !reducedMotion.matches) {
    const stages = researchSequence.querySelectorAll('li');
    const stageObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          stageObserver.unobserve(entry.target);
        }
      });
    }, {threshold: .12, rootMargin: '0px 0px -24px 0px'});
    researchSequence.classList.add('has-motion');
    stages.forEach(stage => stageObserver.observe(stage));
    reducedMotion.addEventListener('change', event => {
      if (event.matches) {
        researchSequence.classList.remove('has-motion');
        stageObserver.disconnect();
      }
    });
  }
})();
