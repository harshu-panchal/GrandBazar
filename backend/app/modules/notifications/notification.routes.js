import express from "express";
import { allowRoles, verifyToken, resolveActiveStore } from "../../middleware/authMiddleware.js";
import {
  registerPushToken,
  removePushToken,
  getNotifications,
  markNotificationsRead,
  clearNotifications,
  getNotificationPreferences,
  updateNotificationPreferences,
  testPushNotification,
  getTestPushNotificationStatus,
  broadcastNotification,
  getBroadcastAudienceStats,
} from "./notification.controller.js";

const notificationRouter = express.Router();
notificationRouter.use(verifyToken, resolveActiveStore);

// Required APIs
notificationRouter.get("/", getNotifications);
notificationRouter.patch("/read", markNotificationsRead);
notificationRouter.delete("/", clearNotifications);
notificationRouter.delete("/clear-all", clearNotifications);
notificationRouter.delete("/:id", clearNotifications);
notificationRouter.post("/broadcast", allowRoles("admin"), broadcastNotification);
notificationRouter.get("/broadcast/audience-stats", allowRoles("admin"), getBroadcastAudienceStats);

// Backward compatibility
notificationRouter.put("/mark-all-read", markNotificationsRead);
notificationRouter.put("/:id/read", markNotificationsRead);
notificationRouter.patch("/read/:id", markNotificationsRead);

const pushRouter = express.Router();
pushRouter.use(verifyToken);
pushRouter.post("/register", registerPushToken);
pushRouter.delete("/remove", removePushToken);
pushRouter.post("/test", testPushNotification);
pushRouter.get("/test-status/:orderId", getTestPushNotificationStatus);
pushRouter.get("/preferences", getNotificationPreferences);
pushRouter.patch("/preferences", updateNotificationPreferences);

export { notificationRouter, pushRouter };
export default notificationRouter;
