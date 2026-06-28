export function isOwnerAccountApproved(account) {
  if (!account) return false;
  if (account.accountType === "staff" || account.parentId) {
    return true;
  }

  if (account.applicationStatus == null && account.isVerified == null) {
    return true;
  }

  const applicationStatus =
    account.applicationStatus || (account.isVerified ? "approved" : "pending");

  return account.isVerified === true && applicationStatus === "approved";
}

export function getOwnerAccountApplicationStatus(account) {
  if (!account) return "pending";
  return account.applicationStatus || (account.isVerified ? "approved" : "pending");
}
