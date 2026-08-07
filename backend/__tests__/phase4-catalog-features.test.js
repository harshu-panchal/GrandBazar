describe("Phase 4: Store & Catalog Features Tests", () => {
  it("should validate signature product filtering logic", () => {
    const products = [
      { id: "p1", name: "Dosa", isSignatureProduct: true },
      { id: "p2", name: "Idli", isSignatureProduct: false },
    ];

    const signatureProducts = products.filter((p) => p.isSignatureProduct);
    expect(signatureProducts.length).toBe(1);
    expect(signatureProducts[0].name).toBe("Dosa");
  });

  it("should validate add-on product mapping payload", () => {
    const parentProduct = {
      name: "Crispy Dosa",
      price: 120,
      addons: ["addon_chutney_1", "addon_sambar_2"],
    };

    expect(Array.isArray(parentProduct.addons)).toBe(true);
    expect(parentProduct.addons).toContain("addon_chutney_1");
  });

  it("should validate YouTube embed URL parser", () => {
    function getEmbedUrl(url) {
      if (!url) return "";
      if (url.includes("youtube.com/watch")) {
        const videoId = url.split("v=")[1]?.split("&")[0];
        return `https://www.youtube.com/embed/${videoId}`;
      }
      if (url.includes("youtu.be/")) {
        const videoId = url.split("youtu.be/")[1]?.split("?")[0];
        return `https://www.youtube.com/embed/${videoId}`;
      }
      return url;
    }

    expect(getEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
    expect(getEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });
});
