import {
  normalizeNotificationRole,
  NOTIFICATION_ROLES,
} from "../app/modules/notifications/notification.constants.js";

describe("notification role normalization", () => {
  test.each(["admin", "superadmin", "accountant", "assistant"])(
    "maps the %s admin role to the notification admin role",
    (role) => {
      expect(normalizeNotificationRole(role)).toBe(NOTIFICATION_ROLES.ADMIN);
    },
  );

  test("maps dynamic admin staff roles by JWT scope", () => {
    expect(normalizeNotificationRole("operations_manager", "admin")).toBe(
      NOTIFICATION_ROLES.ADMIN,
    );
  });
});
