import { jest } from "@jest/globals";

// Mock LoginActivity Model
const mockUpdateMany = jest.fn();
const mockUpdateOne = jest.fn();
const mockCreate = jest.fn();
const mockFind = jest.fn();
const mockFindById = jest.fn();

jest.unstable_mockModule("../app/models/loginActivity.js", () => ({
  default: {
    updateMany: mockUpdateMany,
    updateOne: mockUpdateOne,
    create: mockCreate,
    find: mockFind,
    findById: mockFindById,
  },
}));

const { recordLogin, updateLastActive, recordLogout } = await import("../app/services/loginActivityService.js");
const { getLoginActivities, terminateSession } = await import("../app/controller/admin/loginActivityController.js");

describe("LoginActivity Service and Controller tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("LoginActivity Service", () => {
    test("recordLogin should deactivate previous sessions and create a new active session", async () => {
      const mockUser = {
        _id: "userId123",
        name: "John Doe",
        email: "john@example.com",
        phone: "9876543210",
        role: "seller",
      };

      await recordLogin(mockUser, "Seller", "127.0.0.1", "Mozilla/5.0");

      expect(mockUpdateMany).toHaveBeenCalledWith(
        { userId: "userId123", status: "active" },
        { $set: { status: "logged_out" } }
      );

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        userId: "userId123",
        userModel: "Seller",
        name: "John Doe",
        email: "john@example.com",
        phone: "9876543210",
        role: "seller",
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0",
        status: "active",
      }));
    });

    test("updateLastActive should update lastActiveAt for the active session", async () => {
      await updateLastActive("userId123");

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { userId: "userId123", status: "active" },
        { $set: { lastActiveAt: expect.any(Date) } }
      );
    });

    test("recordLogout should mark all active sessions as logged_out", async () => {
      await recordLogout("userId123");

      expect(mockUpdateMany).toHaveBeenCalledWith(
        { userId: "userId123", status: "active" },
        { $set: { status: "logged_out" } }
      );
    });
  });

  describe("LoginActivity Controller", () => {
    test("getLoginActivities should query using filters and return results", async () => {
      const mockSessions = [
        { _id: "sess1", name: "User 1", userModel: "Customer" },
        { _id: "sess2", name: "Seller 1", userModel: "Seller" },
      ];

      const mockQueryChain = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockSessions),
      };

      mockFind.mockReturnValue(mockQueryChain);

      const req = {
        query: {
          role: "seller",
          status: "active",
          search: "test",
        },
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await getLoginActivities(req, res);

      expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
        userModel: "Seller",
        status: "active",
        $or: [
          { name: { $regex: "test", $options: "i" } },
          { email: { $regex: "test", $options: "i" } },
          { phone: { $regex: "test", $options: "i" } },
        ],
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        results: mockSessions,
      }));
    });

    test("terminateSession should mark specific session as logged_out", async () => {
      const mockSessionInstance = {
        _id: "sess1",
        status: "active",
        save: jest.fn().mockResolvedValue(true),
      };

      mockFindById.mockResolvedValue(mockSessionInstance);

      const req = {
        params: { id: "sess1" },
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await terminateSession(req, res);

      expect(mockFindById).toHaveBeenCalledWith("sess1");
      expect(mockSessionInstance.status).toBe("logged_out");
      expect(mockSessionInstance.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: "Session terminated successfully",
      }));
    });
  });
});
