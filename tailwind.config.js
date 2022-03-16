module.exports = {
  content: [
    '_includes/**/*.njk',
    'index.njk',
    'contact.njk',
    'archive.njk',
    'work.njk',
    'offline.njk',
    '**/*.md',
  ],
  // theme: {
  //   extend: {},
  // },

  corePlugins: {
    // ...
    boxDecorationBreak: false,
  },
  plugins: [],
}
