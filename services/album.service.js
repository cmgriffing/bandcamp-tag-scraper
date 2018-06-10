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

  getAllByTag(tags) {
    return this._database.find({ tags: { $all: tags } })
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
}