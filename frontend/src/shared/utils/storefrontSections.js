export const getStorefrontProductId = (product) =>
  String(product?.id || product?._id || "");

export function resolveStorefrontSections(sections = [], products = []) {
  const productsById = new Map(
    products.map((product) => [getStorefrontProductId(product), product]),
  );
  const assignedIds = new Set(
    sections.flatMap((section) => (section.productIds || []).map(String)),
  );
  const custom = sections.map((section) => ({
    ...section,
    products: (section.productIds || [])
      .map((id) => productsById.get(String(id)))
      .filter(Boolean),
  }));
  const unassigned = products.filter(
    (product) => !assignedIds.has(getStorefrontProductId(product)),
  );

  return [
    ...custom,
    { _id: "all-products", title: "All Products", layout: "grid", products: unassigned },
  ].filter((section) => section.products.length > 0);
}
