const BandcampParser = require('./index.js');
const delay = require('timeout-as-promise');

const parser = new BandcampParser(true);


// const testBasicFuncionality = function() {
//   const results = parser._getAlbumsByTag('synthwave', 1).then(result => {
//     console.log('test results', JSON.stringify(result));
//   }).catch(error => {
//     console.error('test error', JSON.stringify(error));
//   });
// }();

const testDatabaseAndQueue = async function() {
  await delay(1000);
  await parser.playlists.create('Synthwave Playlist');
  await parser.playlists.addTagToPlaylist('synthwave', 'Synthwave Playlist');
}();