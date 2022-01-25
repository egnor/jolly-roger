import { DiscordAccountType } from './schemas/DiscordAccount';

const DiscordOAuthScopes = ['identify', 'guilds.join'];
const API_BASE = 'https://discord.com/api/v8';

function getAvatarCdnUrl(da?: DiscordAccountType, size: number = 128): string | undefined {
  if (da?.avatar) {
    return `https://cdn.discordapp.com/avatars/${da.id}/${da.avatar}.png?size=${size}`;
  } else {
    return undefined;
  }
}

export { API_BASE, DiscordOAuthScopes, getAvatarCdnUrl };
