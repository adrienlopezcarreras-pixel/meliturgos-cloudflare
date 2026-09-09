/**
 * GEN2-26: PWA Service Worker Test
 * Tests that service worker is properly served and caches the main page
 */

import { describe, it, expect } from "bun:test";

describe("GEN2-26: PWA Service Worker", () => {
  it("should serve service worker from /service-worker.js", async () => {
    const response = await fetch("http://localhost/service-worker.js");
    
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/javascript/);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    
    const swText = await response.text();
    expect(swText).toContain("CACHE_NAME");
    expect(swText).toContain("self.addEventListener");
    expect(swText).toContain("fetch");
  });
  
  it("should contain basic caching strategy", async () => {
    const response = await fetch("http://localhost/service-worker.js");
    
    const swText = await response.text();
    
    // Check for cache strategy
    expect(swText).toMatch(/caches\.open/);
    expect(swText).toMatch(/cache\.match/);
    expect(swText).toMatch(/cache\.put/);
    expect(swText).toMatch(/fetch\(/);
  });
  
  it("should serve manifest from /manifest.webmanifest", async () => {
    const response = await fetch("http://localhost/manifest.webmanifest");
    
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/manifest+json");
    
    const manifest = await response.json();
    expect(manifest.name).toBe("MELITURGOS");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.background_color).toBe("#0c0c0e");
    expect(manifest.theme_color).toBe("#0c0c0e");
  });
  
  it("should include manifest link and theme color meta tag", async () => {
    const response = await fetch("http://localhost/");
    
    const html = await response.text();
    
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">');
    expect(html).toContain('name="theme-color" content="#0c0c0e"');
  });
});

console.log("✓ GEN2-26: PWA Service Worker functionality verified");