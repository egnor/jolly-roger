import PendingAnnouncements from '../../lib/models/PendingAnnouncements';
import Migrations from './Migrations';

Migrations.add({
  version: 5,
  name: 'Create indexes for pending announcements',
  async up() {
    await PendingAnnouncements.createIndexAsync({ user: 1 });
  },
});
