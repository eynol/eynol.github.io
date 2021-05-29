module.exports = {
  mode: 'jit',
  purge: [

    '_includes/**/*.njk',
    'index.njk',
    'contact.njk',
    'archive.njk',
    'work.njk',
    'offline.njk',
    '**/*.md',
  ],
  darkMode: "media", // or 'media' or 'class'
  theme: {
    extend: {},
  },
  variants: {
    extend: {},
  },
  corePlugins: {
    // ...
    boxDecorationBreak: false,
  },
  plugins: [],
}
