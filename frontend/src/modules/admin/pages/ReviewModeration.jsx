import React from "react";
import ReviewsPage from "@shared/components/reviews/ReviewsPage";
import { adminApi } from "../services/adminApi";

export default function ReviewModeration() {
  return (
    <ReviewsPage
      title="Review Content"
      description="View every customer rating, including published verified-purchase reviews, and control what appears publicly."
      fetchReviews={adminApi.getReviews}
      updateStatus={adminApi.updateReviewStatus}
      canModerate
    />
  );
}
