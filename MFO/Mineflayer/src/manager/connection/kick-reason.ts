import { simplify, TagType, type Tags } from 'prismarine-nbt';

/**
 * Mineflayer's `kicked` event reason is either a plain string or an NBT-encoded
 * chat component (compound tag with `text`/`extra`/color fields, per the
 * modern configuration/play disconnect packet). Flattens either shape into
 * plain text for logs and alerts.
 */
export function formatKickReason(reason: unknown): string {
  if (typeof reason === 'string') return reason;
  return flattenChatComponent(simplify(reason as Tags[TagType]));
}

function flattenChatComponent(component: unknown): string {
  if (typeof component === 'string') return component;
  if (Array.isArray(component)) return component.map(flattenChatComponent).join('');
  if (component === null || typeof component !== 'object') return '';

  const fields = component as Record<string, unknown>;
  const own = typeof fields.text === 'string' ? fields.text : fields[''];
  const text = typeof own === 'string' ? own : '';
  const extra = 'extra' in fields ? flattenChatComponent(fields.extra) : '';
  return text + extra;
}
