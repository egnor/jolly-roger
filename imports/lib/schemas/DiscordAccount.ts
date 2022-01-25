import * as t from 'io-ts';

const DiscordAccount = t.type({
  id: t.string,
  username: t.string,
  discriminator: t.string,
  avatar: t.union([t.string, t.undefined]),
});

export type DiscordAccountType = t.TypeOf<typeof DiscordAccount>;

export default DiscordAccount;
