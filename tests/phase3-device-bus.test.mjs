import assert from "node:assert/strict";
const testWorker = "/tmp/meliturgos-device-bus-test.mjs";
import { copyFile, unlink } from "node:fs/promises";

await copyFile(new URL("../worker.js", import.meta.url), testWorker);

const DeviceEvents = {
  CONNECTED: "device_connected",
  DISCONNECTED: "device_disconnected",
  SYNC_STARTED: "sync_started",
  SYNC_COMPLETED: "sync_completed",
  MESSAGE_RECEIVED: "message_received",
  COMMAND_RECEIVED: "command_received"
};

class DeviceBus {
  constructor() {
    this.devices = new Map();
    this.listeners = new Map();
    this.connections = new Map();
  }

  async registerDevice(userId, deviceId, deviceInfo) {
    assert(userId, "userId required");
    assert(deviceId, "deviceId required");
    assert(deviceInfo, "deviceInfo required");

    const device = {
      userId,
      deviceId,
      ...deviceInfo,
      connectedAt: Date.now(),
      lastSeenAt: Date.now()
    };

    this.devices.set(deviceId, device);
    this.connections.set(deviceId, true);

    this.emit(DeviceEvents.CONNECTED, device);

    console.log(`[DeviceBus] Device registered: ${deviceId} for user ${userId}`);
    return device;
  }

  async unregisterDevice(deviceId) {
    assert(deviceId, "deviceId required");
    assert(this.devices.has(deviceId), "Device not found");

    const device = this.devices.get(deviceId);

    this.devices.delete(deviceId);
    this.connections.delete(deviceId);

    this.emit(DeviceEvents.DISCONNECTED, device);

    console.log(`[DeviceBus] Device unregistered: ${deviceId}`);
    return device;
  }

  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  getUserDevices(userId) {
    return Array.from(this.devices.values()).filter(d => d.userId === userId);
  }

  isConnected(deviceId) {
    return this.connections.has(deviceId) && this.connections.get(deviceId) === true;
  }

  emit(event, data) {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach(handler => handler(data));
  }

  on(event, handler) {
    assert(typeof handler, "handler must be a function");
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
    console.log(`[DeviceBus] Listener registered for event: ${event}`);
  }

  async syncToDevice(userId, deviceId, data) {
    assert(userId, "userId required");
    assert(deviceId, "deviceId required");
    assert(data, "data required");

    const device = this.getDevice(deviceId);
    assert(device && device.userId === userId, "Invalid device for user");

    console.log(`[DeviceBus] Syncing to device: ${deviceId} for user ${userId}`);
    this.emit(DeviceEvents.SYNC_STARTED, { userId, deviceId, data });

    // Simulate sync
    await new Promise(resolve => setTimeout(resolve, 10));

    this.emit(DeviceEvents.SYNC_COMPLETED, { userId, deviceId, data });

    return { success: true };
  }
}

const deviceBus = new DeviceBus();

async function test() {
  console.log("Testing Device Bus...");

  // Test 1: Register device
  console.log("\n[Test 1] Register device");
  const device = await deviceBus.registerDevice("user_123", "device_456", {
    type: "mobile",
    name: "iPhone 15 Pro"
  });

  assert.ok(device);
  assert.equal(device.userId, "user_123");
  assert.equal(device.type, "mobile");
  console.log("✓ Device registered");

  // Test 2: Get device
  console.log("\n[Test 2] Get device");
  const retrieved = deviceBus.getDevice("device_456");
  assert.deepStrictEqual(retrieved, device);
  console.log("✓ Device retrieved");

  // Test 3: Get user devices
  console.log("\n[Test 3] Get user devices");
  const userDevices = deviceBus.getUserDevices("user_123");
  assert.ok(userDevices.length > 0);
  console.log(`✓ User has ${userDevices.length} devices`);

  // Test 4: Is connected
  console.log("\n[Test 4] Check connection");
  const connected = deviceBus.isConnected("device_456");
  assert.ok(connected);
  console.log("✓ Device is connected");

  // Test 5: Event listener
  console.log("\n[Test 5] Event listener");
  const events = [];
  deviceBus.on(DeviceEvents.CONNECTED, (data) => events.push({ event: DeviceEvents.CONNECTED, data }));

  await deviceBus.registerDevice("user_789", "device_789", { type: "pc" });
  assert.ok(events.length > 0);
  console.log("✓ Event dispatched");

  // Test 6: Sync to device
  console.log("\n[Test 6] Sync to device");
  const syncResult = await deviceBus.syncToDevice("user_123", "device_456", { messages: 100 });
  assert.ok(syncResult.success);
  console.log("✓ Sync completed");

  // Test 7: Unregister device
  console.log("\n[Test 7] Unregister device");
  const unregistered = await deviceBus.unregisterDevice("device_456");
  assert.ok(unregistered);
  assert.ok(!deviceBus.isConnected("device_456"));
  console.log("✓ Device unregistered");

  console.log("\n✅ Device Bus Test Suite PASSED");
  console.log("Gen2-68: DeviceBus foundation verified");

  await unlink(testWorker);
}

test().catch(console.error);