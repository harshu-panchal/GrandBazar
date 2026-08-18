import Delivery from "../../models/delivery.js";
import Order from "../../models/order.js";
import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import { adminAssignRiderAtomic } from "../../services/orderWorkflowService.js";
import { resolveOrderStatus } from "../../services/orderStatusResolver.js";

export const getDeliveryPartners = async (req, res) => {
  try {
    const { status, verified } = req.query;
    const query = {};

    if (status === "online") {
      query.isOnline = true;
    } else if (status === "offline") {
      query.isOnline = false;
    }

    if (verified === "true") {
      query.isVerified = true;
    } else if (verified === "false") {
      query.isVerified = false;
    }

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const [deliveryPartners, total] = await Promise.all([
      Delivery.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Delivery.countDocuments(query),
    ]);

    return handleResponse(res, 200, "Delivery partners fetched successfully", {
      items: deliveryPartners,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const approveDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndUpdate(
      id,
      { isVerified: true },
      { new: true },
    );

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(res, 200, "Rider approved successfully", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const rejectDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndDelete(id);

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(
      res,
      200,
      "Rider application rejected and removed",
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      email,
      address,
      vehicleType,
      vehicleNumber,
      drivingLicenseNumber,
      accountHolder,
      accountNumber,
      ifsc,
      currentArea,
    } = req.body;

    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (phone !== undefined) updateFields.phone = phone;
    if (email !== undefined) updateFields.email = email;
    if (address !== undefined) updateFields.address = address;
    if (vehicleType !== undefined) updateFields.vehicleType = vehicleType;
    if (vehicleNumber !== undefined) updateFields.vehicleNumber = vehicleNumber;
    if (drivingLicenseNumber !== undefined) updateFields.drivingLicenseNumber = drivingLicenseNumber;
    if (accountHolder !== undefined) updateFields.accountHolder = accountHolder;
    if (accountNumber !== undefined) updateFields.accountNumber = accountNumber;
    if (ifsc !== undefined) updateFields.ifsc = ifsc;
    if (currentArea !== undefined) updateFields.currentArea = currentArea;

    const rider = await Delivery.findByIdAndUpdate(id, updateFields, { new: true });

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(res, 200, "Rider details updated successfully", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getActiveFleet = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = {
      deliveryBoy: { $ne: null },
      status: {
        $in: ["confirmed", "packed", "shipped", "out_for_delivery"],
      },
    };

    const [activeOrders, total] = await Promise.all([
      Order.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("deliveryBoy", "name phone documents vehicleType")
        .populate("seller", "shopName address name")
        .populate("customer", "name phone")
        .lean(),
      Order.countDocuments(query),
    ]);

    const fleetData = activeOrders.map((order) => {
      // NOTE: `status` here is a bespoke, partially-dead label mapping
      // ("shipped" isn't a legal Order.status value) — left as-is because
      // frontend/src/modules/admin/pages/FleetTracking.jsx string-matches
      // these exact label values ("On the Way"/"At Pickup") for badge
      // styling. Fixing this properly means switching that comparison to
      // `displayStatus` too, which belongs in the Phase 4 frontend
      // migration, not this backend-only additive pass. `displayStatus` is
      // exposed below so that migration has the correct data to switch to.
      return {
        id: order.orderId,
        status:
          order.status === "out_for_delivery"
            ? "On the Way"
            : order.status === "packed"
              ? "At Pickup"
              : order.status === "shipped"
                ? "In Transit"
                : "Assigned",
        displayStatus: resolveOrderStatus(order),
        deliveryBoy: {
          name: order.deliveryBoy?.name || "Unknown",
          phone: order.deliveryBoy?.phone || "N/A",
          id: order.deliveryBoy?._id || "N/A",
          vehicle: order.deliveryBoy?.vehicleType || "N/A",
          image:
            order.deliveryBoy?.documents?.profileImage ||
            "https://via.placeholder.com/200",
        },
        seller: {
          name: order.seller?.shopName || order.seller?.name || "Unknown",
        },
        customer: {
          name: order.customer?.name || "Guest",
          phone: order.customer?.phone || "N/A",
        },
        lastUpdate: order.updatedAt,
      };
    });

    return handleResponse(res, 200, "Active fleet fetched successfully", {
      items: fleetData,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getUnassignedOrders = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = {
      workflowStatus: "DELIVERY_SEARCH",
      deliveryBoy: null,
    };

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate("seller", "shopName address location")
        .populate("customer", "name phone")
        .lean(),
      Order.countDocuments(query),
    ]);

    const items = orders.map((order) => ({
      id: order.orderId,
      _id: order._id,
      createdAt: order.createdAt,
      seller: {
        name: order.seller?.shopName || "Unknown",
        address: order.seller?.address || "",
        location: order.seller?.location || null,
      },
      customer: {
        name: order.customer?.name || "Guest",
        phone: order.customer?.phone || "N/A",
      },
    }));

    return handleResponse(res, 200, "Unassigned orders fetched successfully", {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const assignOrderToRider = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { riderId } = req.body;
    if (!riderId) {
      return handleResponse(res, 400, "riderId is required");
    }
    const { order, rider, distanceKm } = await adminAssignRiderAtomic(
      req.user?.id,
      orderId,
      riderId,
    );
    return handleResponse(res, 200, "Delivery partner assigned successfully", {
      order,
      rider: { id: rider._id, name: rider.name },
      distanceKm,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
