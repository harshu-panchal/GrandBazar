export const FOOD_TYPE_LABELS = { veg: '🟢 Veg', non_veg: '🔴 Non-Veg', egg: '🥚 Contains Egg', non_food: 'Non-Food Item' };
export const RETURN_POLICY_LABELS = { non_returnable: 'Non-Returnable', replace_only: 'Replace Only', returnable: 'Returnable' };

export function buildProductDetailRows(product, sellerProfile, supportEmail) {
    const legal = product?.legal || {};
    return [
        { label: 'Brand', value: product?.brand || 'Generic / Fresh', emoji: '🏷️' },
        { label: 'Weight / Unit', value: product?.netQuantity ? `${product.netQuantity} ${product.unit || ''}` : (product?.weight || '1 unit'), emoji: '⚖️' },
        ...(product?.foodType && FOOD_TYPE_LABELS[product.foodType] ? [{ label: 'Food Type', value: FOOD_TYPE_LABELS[product.foodType], emoji: '🍽️' }] : []),
        ...(product?.shelfLife ? [{ label: 'Shelf Life', value: product.shelfLife, emoji: '📅' }] : []),
        ...(legal.countryOfOrigin ? [{ label: 'Country of Origin', value: legal.countryOfOrigin, emoji: '🇮🇳' }] : []),
        ...((legal.inheritStoreFssai ? (sellerProfile?.fssaiLicenseNumber || sellerProfile?.documents?.fssaiLicense) : legal.fssaiLicenseNumber) ? [{ label: 'FSSAI License', value: legal.inheritStoreFssai ? (sellerProfile?.fssaiLicenseNumber || sellerProfile?.documents?.fssaiLicense) : legal.fssaiLicenseNumber, emoji: '🛡️' }] : []),
        ...(legal.manufactureDate ? [{ label: 'Manufactured On', value: new Date(legal.manufactureDate).toLocaleDateString(), emoji: '🏭' }] : []),
        ...(product?.expiryDate ? [{ label: 'Best Before', value: new Date(product.expiryDate).toLocaleDateString(), emoji: '⏳' }] : []),
        ...(legal.batchNumber ? [{ label: 'Batch No.', value: legal.batchNumber, emoji: '🔖' }] : []),
        ...(legal.manufacturerPacker ? [{ label: 'Manufactured By', value: legal.manufacturerPacker, emoji: '🏷️' }] : []),
        ...(legal.storageInstructions ? [{ label: 'Storage', value: legal.storageInstructions, emoji: '❄️' }] : []),
        ...(legal.ingredients ? [{ label: 'Ingredients', value: legal.ingredients, emoji: '📋' }] : []),
        ...(Array.isArray(legal.allergens) && legal.allergens.length > 0 ? [{ label: 'Allergens', value: legal.allergens.join(', '), emoji: '⚠️' }] : []),
        ...(legal.ageRestricted ? [{ label: 'Age Restriction', value: '18+ Only', emoji: '🔞' }] : []),
        ...(legal.prescriptionOnly ? [{ label: 'Prescription', value: 'Required', emoji: '💊' }] : []),
        ...(product?.returnPolicy && RETURN_POLICY_LABELS[product.returnPolicy] ? [{ label: 'Return Policy', value: RETURN_POLICY_LABELS[product.returnPolicy], emoji: '↩️' }] : []),
        ...(Number(product?.minOrderQuantity) > 1 ? [{ label: 'Min Order Qty', value: product.minOrderQuantity, emoji: '🔢' }] : []),
        ...(Number(product?.maxOrderQuantity) > 0 ? [{ label: 'Max Order Qty', value: product.maxOrderQuantity, emoji: '🔢' }] : []),
        ...(product?.isPreorderEligible && product?.preorderExpectedDate ? [{ label: 'Pre-order Arrives', value: new Date(product.preorderExpectedDate).toLocaleDateString(), emoji: '🚚' }] : []),
        { label: 'Customer Care', value: supportEmail, emoji: '📧' },
    ];
}
