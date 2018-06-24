const cheerio = require('cheerio');
const superagent = require('superagent');
const Datastore = require('nedb-promises');
const delay = require('timeout-as-promise');

const Albums = new Datastore({ filename: './albums.dat', autoload: true });
const Playlists = new Datastore({ filename: './playlists.dat', autoload: true });
const Timestamps = new Datastore({ filename: './timestamps.dat', autoload: true });

const PlayListService = require('./services/playlist.service');
const AlbumService = require('./services/album.service');

const _getAlbumImage = function(clickText) {
  return clickText.slice(12, -2);
};

class BandcampParser {

  constructor(shouldClearData) {
    if(shouldClearData) {
      this.clearDatabases().then(result => {
        this.setupState();
      })
    } else {
      this.setupState();
    }

  };

  setupState() {
    this._initTimer = null;
    this._lastQueried = 1;
    this.queuedTags = new Set();
    this.fetchedTags = [];

    // services exposed as properties
    this.playlists = new PlayListService(Playlists);
    this.albums = new AlbumService(Albums);

    this.tagTimestamps = {};
    Timestamps.find({}).then(timestamps => {
      timestamps.map(entry => {
        if(entry.type === 'tag') {
          this.tagTimestamps[entry.name] = entry.timestamp;
        }
      });

      this.setupTimer();
    });

  }

  setupTimer() {
    const timerFunction = async () => {
      try{

        // Fetching the tags that need to be searched
        const playlists = await this.playlists.getAllSinceTimestamp(this._lastQueried);
        this._lastQueried = Date.now();

        playlists.map(playlist => {
          
          playlist.tags.map(tag => {
            if(
              !this.tagTimestamps[tag] ||
              (this.tagTimestamps[tag] && this.tagTimestamps[tag] < Date.now() - (60000 * 60))
            ) {
              this.queuedTags.add(tag);
              this.tagTimestamps[tag] = Date.now();
            }
            this.playlists.updateTimestamp(playlist.name);
          });
        });

        const results = {};
        const queuedTagsArray = Array.from(this.queuedTags);
        for(let i = 0; i < 5 && i < queuedTagsArray.length; i++ ) {
          const tag = queuedTagsArray[i];
          const entry = await Timestamps.findOne({name: tag});
          if(!entry) {
            await Timestamps.insert({ name: tag, timestamp: Date.now(), type: 'tag' });
          } else {
            await Timestamps.update({ name: tag }, { $set: { timestamp: Date.now(), type: 'tag' } });
          }
          this.fetchedTags.push(tag);
          const albums = await this._getAlbumsByTag(tag);
          if(albums) {
            albums.map(async album => {
              let albumEntry = await this.albums.getByUrl(album.url);
              if(!albumEntry) {
                albumEntry = await this.albums.create(
                  album.url,
                  album.image,
                  album.name,
                  album.artist,
                );
              }
  
              await this.albums.addTagToAlbum(tag, album.url);
  
            });
          }
          await delay(10000);
        }

        this.fetchedTags.map(tag => {
          this.queuedTags.delete(tag);
        })

      } catch(e) {
        console.log('Something went terribly wrong.', e);
      }


    };

    timerFunction();
    this._initTimer = setInterval(timerFunction, 60000);
  }

  clearDatabases() {
    return Promise.all([
      Albums.remove({}, { multi: true }),
      Playlists.remove({}, { multi: true }),
      Timestamps.remove({}, { multi: true }),
    ]);
  }

  // Private methods
  _getAlbumsByTag(tag, page) {

    return new Promise((resolve, reject) => {

      let url = 'https://bandcamp.com/tag/' + tag + '?sort_field=date';

      if(page) {
        url += '&page=' + page;
      }

      superagent.get(url)
        .end((err, res) => {
          const $ = cheerio.load(res.text);
          const results = $('.item');
          let parsedResults = [];
          for(let i = 0; i < results.length; i++) {
            const item = $(results[i]);
            const linkElement = item.find($('a'));
            parsedResults.push({
              name: linkElement.find($('.itemtext')).text(),
              artist: linkElement.find($('.itemsubtext')).text(),
              image: _getAlbumImage(linkElement.find($('.tralbum-art-container')).attr('onclick')),
              url: linkElement.attr('href')
            });
          }
          resolve(parsedResults);
        });
        
    });
  }
};

module.exports = BandcampParser;

process.on('unhandledRejection', function (error) {
  // Will print "unhandledRejection err is not defined"
  console.log('unhandledRejection', error.message);
  throw error;
});

process.on('uncaughtException', function(error) {
  // Will print "unhandledRejection err is not defined"
  console.log('uncaughtException', error.message);
  throw error;
});