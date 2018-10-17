const cheerio = require('cheerio');
const superagent = require('superagent');
const Datastore = require('nedb-promises');
const delay = require('timeout-as-promise');

const PlayListService = require('./services/playlist.service');
const AlbumService = require('./services/album.service');

function parserFactory(path) {
  console.log('userPath', `${path}`);
  const Albums = new Datastore({ filename: `${path}/albums.dat`, autoload: true });
  const Playlists = new Datastore({ filename: `${path}/playlists.dat`, autoload: true });
  const Timestamps = new Datastore({ filename: `${path}/timestamps.dat`, autoload: true });


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
      this._initAlbumsTimer = null;
      this._lastQueried = 1;
      this.queuedTags = new Set();
      this.fetchedTags = [];

      this._initFiltersTimer = null;

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

        this.setupAlbumsTimer();
        this.setupFiltersTimer();

      });

    }

    setupAlbumsTimer() {
      const timerFunction = async () => {
        console.log('firing albums timer');
        try{

          // Fetching the tags that need to be searched
          const playlists = await this.playlists.getAllSinceTimestamp(this._lastQueried);
          this._lastQueried = Date.now();

          playlists.map(playlist => {

            playlist.tags.map(tag => {
              if(
                !this.tagTimestamps[tag] ||
                (this.tagTimestamps[tag] && this.tagTimestamps[tag] < Date.now() - (60000 * 60 * 12))
              ) {
                this.queuedTags.add(tag);
                this.tagTimestamps[tag] = Date.now();
              }
              this.playlists.updateTimestamp(playlist.name);
            });
          });

          const pageCount = 3;
          const results = {};
          const queuedTagsArray = Array.from(this.queuedTags);
          for(let tagIndex = 0; tagIndex < 5 && tagIndex < queuedTagsArray.length; tagIndex++ ) {
            const tag = queuedTagsArray[tagIndex];
            const entry = await Timestamps.findOne({name: tag});
            if(!entry) {
              await Timestamps.insert({ name: tag, timestamp: Date.now(), type: 'tag' });
            } else {
              await Timestamps.update({ name: tag }, { $set: { timestamp: Date.now(), type: 'tag' } });
            }
            this.fetchedTags.push(tag);
            for(let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
              const albums = await this._getAlbumsByTag(tag, pageNumber);
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
      this._initAlbumsTimer = setInterval(timerFunction, 60000 * 1);
    }

    setupFiltersTimer() {
      const timerFunction = async () => {
        console.log('firing filters timer');
        const unfilteredAlbum = await this.albums.getUnfilteredAlbum();
        if(unfilteredAlbum) {
          const { longEnough,  fullyPlayable } = await this._getAlbumMetadata(unfilteredAlbum.url);
          console.log('settingFilters: ', unfilteredAlbum.url, longEnough, fullyPlayable);
          this.albums.setAlbumFilters(unfilteredAlbum.url, longEnough, fullyPlayable);
        } else {
          const unplayableAlbum = await this.albums.getUnplayableAlbum();

          if(unplayableAlbum) {
            const { longEnough,  fullyPlayable } = await this._getAlbumMetadata(unplayableAlbum.url);
            console.log('settingFilters: ', unplayableAlbum.url, longEnough, fullyPlayable);
            this.albums.setAlbumFilters(unplayableAlbum.url, longEnough, fullyPlayable);
          }
        }
      };

      timerFunction();
      this._initFiltersTimer = setInterval(timerFunction, 30000);
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

    _getAlbumMetadata(albumUrl) {
      return new Promise((resolve, reject) => {
        superagent.get(albumUrl)
          .end((err, res) => {
            if(err) {
              console.warn('error fetching album metadata', albumUrl, err);
              resolve({
                fullyPlayable: false,
                longEnough: false,
              });
              return;
            }
            const $ = cheerio.load(res.text);
            const rows = $('.track_row_view');
            const playableRows = rows.filter((index, row) => {
              const titleLink = $(row).find('.title a');
              if(titleLink.length > 0) {
                return true;
              } else {
                return false;
              }
            });

            const fullyPlayable = (rows.length === playableRows.length);
            const longEnough = (rows.length > 3);
            resolve({
              fullyPlayable,
              longEnough,
            });
          });
      });
    }

  };


  return BandcampParser;

}

module.exports = parserFactory;

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