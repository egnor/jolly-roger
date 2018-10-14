import { Meteor } from 'meteor/meteor';

function dropIndex(model, index) {
  // _dropIndex is not idempotent, so we need to figure out if the
  // index already exists
  const collection = model.rawCollection();
  const indexExists = Meteor.wrapAsync(collection.indexExists, collection);
  if (indexExists(index)) {
    model._dropIndex(index);
  }
}

// eslint-disable-next-line import/prefer-default-export
export { dropIndex };
