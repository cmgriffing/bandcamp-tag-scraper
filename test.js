const parserFactory = require('./index.js');
const delay = require('timeout-as-promise');

const BandcampParser = parserFactory('./');
const parser = new BandcampParser(true);


const testBasicFuncionality = function() {
  const results = parser._getAlbumsByTag('synthwave', 1).then(result => {
    console.log('test results', JSON.stringify(result));
  }).catch(error => {
    console.error('test error', JSON.stringify(error));
  });
};

const testDatabaseAndQueue = async function() {
  try{

    await parser.clearDatabases();
    await delay(10000);
    const now = Date.now();
    await parser.playlists.create('Synthwave Playlist ' + now);
    await parser.playlists.addTagsToPlaylist(['synthwave', 'chillwave', 'lo-fi'], 'Synthwave Playlist ' + now);

    const playlists = await parser.playlists.getAll();
    console.log('playlists: ', JSON.stringify(playlists));

    setInterval(async () => {
      try {
        const totalAlbums = await parser.albums.getAll();
        console.log(`Found ${totalAlbums.length} total albums.`);
        const synthwaveAlbums = await parser.albums.getAllByTags('synthwave');
        console.log(`Found ${synthwaveAlbums.length} synthwave albums.`);
        const albums = await parser.albums.getAllByTags(['synthwave', 'chillwave']);
        console.log(`Found ${albums.length} synthwave and chillwave albums.`);
      } catch(error) {
        console.log('error in test interval: ', error.message);
      }
    }, 10000);

  } catch(error) {
    console.log('error in test: ', error.message);
  }
};

const testFetchingMetadata = async function() {
  try {
    // Eventually this test will fail when the album "releases"
    // new albums will need to be fetched from time to time
    const metadata = await parser._getAlbumMetadata('https://jstrecords.bandcamp.com/album/fears-and-dreams-of-living-machines-lp');
    console.log('metadata', metadata);
  } catch (e) {
    console.log('Error testing the fetching of album metadata: ', e);
  }
};