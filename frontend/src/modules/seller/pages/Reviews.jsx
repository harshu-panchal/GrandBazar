import React from "react";
import ReviewsPage from "@shared/components/reviews/ReviewsPage";
import { sellerApi } from "../services/sellerApi";

export default function Reviews() {
  return <ReviewsPage title="Customer Reviews" description="See verified product ratings and store feedback submitted by customers for the active store." fetchReviews={sellerApi.getReviews} />;
}
