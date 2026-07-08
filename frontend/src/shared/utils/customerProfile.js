export function formatIndiaPhoneForDisplay(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (raw.startsWith('+91')) {
    return raw.replace(/^\+91[\s-]*/, '');
  }

  if (raw.startsWith('91') && raw.length >= 12) {
    return raw.replace(/^91[\s-]*/, '');
  }

  return raw;
}

export function getCustomerDisplayName(user) {
  const name = String(user?.name || '').trim();
  if (name && name.toLowerCase() !== 'customer') {
    return name;
  }

  const phone = formatIndiaPhoneForDisplay(user?.phone);
  if (phone) {
    return phone;
  }

  return name || 'Customer';
}

export function getCustomerPhoneForDisplay(user) {
  return formatIndiaPhoneForDisplay(user?.phone || user?.mobile || '');
}
