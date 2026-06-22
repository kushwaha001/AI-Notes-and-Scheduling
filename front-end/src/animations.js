export const fadeUp = {
  initial: {
    opacity: 0,
    y: 40,
  },
  whileInView: {
    opacity: 1,
    y: 0,
  },
  viewport: {
    once: true,
  },
  transition: {
    duration: 0.7,
  },
};

export const heroAnimation = {
  initial: {
    opacity: 0,
    y: -60,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  transition: {
    duration: 0.8,
  },
};