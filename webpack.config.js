const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/cpldviewer.js',
  output: {
    filename: 'cpldviewer.js',
    path: path.resolve(__dirname, 'media/js'),
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  resolve: {
    fallback: { "url": require.resolve("url/") },
    fallback: { "stream": require.resolve("stream-browserify") }
  }
};