module.exports = class AlbumService {

  constructor(database) {
    this._database = database;
  }

  create(url, image, name, artist) {
    return this._database.insert({ url, tags: [], image, name, artist });
  }

  getAll() {
    return this._database.find({});
  }

  getAllByTags(tags) {
    // return this._database.find({ tags: { $all: tags } }).catch(error => {
    //   console.log('catching error: ', error.message);
    // });
    if(!Array.isArray(tags)) {
      tags = [tags];
    }

    return this._database.find({
      $and: tags.map(tag => {
        return {
          tags: tag
        }
      })
    });

  }

  getAllByTag(tag) {
    return this._database.find({ tags: { $elemMatch: tag } });
  }

  getByUrl(url) {
    return this._database.findOne({url});
  }

  addTagToAlbum(tag, url) {
    return this._database.update({ url } ,{ $addToSet: { tags: tag } });
  }

  removeTagFromAlbum(tag, url) {
    return this._database.update({ url } ,{ $pull: { tags: tag } });
  }

  getUnfilteredAlbum() {
    return this._database.findOne({
      longEnough: { $exists: false },
      fullyPlayable: { $exists: false },
    });
  }

  getUnplayableAlbum() {
    return this._database.findOne({
      longEnough: true,
      fullyPlayable: false,
      lastChecked: { $gt: Date.now() + (3600 * 4 ) }
    });
  }

  setAlbumFilters(albumUrl, longEnough, fullyPlayable) {
    return this._database.update({ url: albumUrl }, {
      $set: {
        longEnough,
        fullyPlayable,
        lastChecked: Date.now()
      }
    })
  }

}