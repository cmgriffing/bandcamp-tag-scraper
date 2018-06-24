module.exports = class PlayListService {

  constructor(database) {
    this._database = database;
  }

  async create(name) {
    return this._database.insert({ name, tags: [], lastQueried: 0 });
  }

  async updateTimestamp(name) {
    return this._database.update({ name }, { $set: { lastQueried: Date.now() }} );
  }

  async getAll() {
    return this._database.find({});
  }

  async getAllSinceTimestamp(timestamp) {
    return this._database.find({lastQueried: {$lt: timestamp}});
  }

  async getByName(name) {
    return this._database.findOne({name});
  }

  async addTagsToPlaylist(tags, playlistName) {
    if(!Array.isArray(tags)) {
      tags = [tags];
    }
    return this._database.update(
      { name: playlistName},
      { $addToSet: { tags: { $each: tags } } }
    );
  }

  async removeTagFromPlayList(tag, playlistName) {
    return this._database.update({ name: playlistName} ,{ $pull: { tags: tag } });
  }
}