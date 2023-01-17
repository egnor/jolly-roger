import type { Meteor } from 'meteor/meteor';
import nodeIsMention from './nodeIsMention';
import nodeIsText from './nodeIsText';
import type { ChatMessageType } from './schemas/ChatMessage';

const NeededChatFields = ['text', 'content', 'sender'] as const;
type PartialChatMessageType = Pick<ChatMessageType, typeof NeededChatFields[number]>

export function normalizedForDingwordSearch(chatMessage: PartialChatMessageType): string {
  return chatMessage.text?.trim().toLowerCase() ??
    chatMessage.content?.children.map((child) => {
      if (nodeIsText(child)) {
        return child.text;
      } else {
        // No need to look for dingwords in @-mentions, but let them split words
        return ' ';
      }
    }).join('').trim().toLowerCase() ?? '';
}

export function normalizedMessageDingsUserByDingword(
  normalizedMessage: string,
  user: Meteor.User
): boolean {
  const words = normalizedMessage.split(/\s+/);
  return (user.dingwords ?? []).some((dingword) => {
    const dingwordLower = dingword.toLowerCase();
    return words.some((word) => word.startsWith(dingwordLower));
  });
}

export function messageDingsUser(chatMessage: PartialChatMessageType, user: Meteor.User): boolean {
  if (chatMessage.sender === user._id || chatMessage.sender === undefined) {
    // You can never be dinged by yourself, nor by system messages.
    return false;
  }
  const normalizedText = normalizedForDingwordSearch(chatMessage);
  const dingedByDingwords = normalizedMessageDingsUserByDingword(normalizedText, user);
  const dingedByMentions = (chatMessage.content?.children ?? []).some((child) => {
    if (nodeIsMention(child)) {
      return child.userId === user._id;
    } else {
      return false;
    }
  });
  return dingedByDingwords || dingedByMentions;
}
