import { createD1EventBusAdapter } from '../events/d1-event-bus.js';
import { createEventBus } from '../events/event-bus.js';

function eventCapabilityError(code, status = 503) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

const STRING_ID = { type:'string', minLength:1, maxLength:200 };
const STRING_4K = { type:'string', minLength:1, maxLength:4000 };
const TIME = { type:'number' };
const PAYLOAD = { type:'object', additionalProperties:true };
const META = { type:'object', additionalProperties:true };

function requireDb(db) {
  if (!db) throw eventCapabilityError('EVENT_DB_REQUIRED');
}

function service(db) {
  requireDb(db);
  return createEventBus(createD1EventBusAdapter(db));
}

function capability(bus, record, execute) {
  bus.discover({
    version:'1.0.0',
    provider:'core',
    permissions:[],
    enabled:true,
    ...record,
  }, execute);
}

const EVENT_FIELDS = {
  event_id: STRING_ID,
  topic: STRING_ID,
  source: STRING_ID,
  idempotency_key: STRING_ID,
  payload: PAYLOAD,
  created_at: TIME,
  correlation_id: STRING_ID,
  causation_id: STRING_ID,
  metadata: META,
};

export function registerEventBusCapabilities(bus, { db } = {}) {
  const health = db ? 'HEALTHY' : 'UNAVAILABLE';

  capability(bus, {
    id:'event.publish', name:'Publier un événement', category:'events',
    description:'Publishes one durable idempotent Event Bus envelope to D1.',
    input_schema:{
      type:'object', properties:EVENT_FIELDS,
      required:['event_id','topic','source','idempotency_key','payload','created_at'],
      additionalProperties:false,
    },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'MEDIUM', health,
  }, input => service(db).publish(input));

  capability(bus, {
    id:'event.schedule', name:'Planifier un événement', category:'events',
    description:'Schedules one durable follow-up event with a bounded due time.',
    input_schema:{
      type:'object',
      properties:{ ...EVENT_FIELDS, available_at:TIME, availableAt:TIME, event:{ type:'object', additionalProperties:true } },
      additionalProperties:false,
    },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'MEDIUM', health,
  }, input => service(db).schedule(input));

  capability(bus, {
    id:'event.pull', name:'Prendre des événements dus', category:'events',
    description:'Leases a bounded batch of due events for at-least-once delivery.',
    input_schema:{
      type:'object',
      properties:{
        consumer:STRING_ID, topic:STRING_ID, now:TIME,
        limit:{ type:'integer', minimum:1, maximum:100 },
        lease_ms:{ type:'integer', minimum:1, maximum:3600000 },
      },
      required:['consumer','now'],
      additionalProperties:false,
    },
    output_schema:{ type:'array', items:{ type:'object', additionalProperties:true } },
    risk:'MEDIUM', health,
  }, input => service(db).pull(input));

  capability(bus, {
    id:'event.ack', name:'Acquitter un événement', category:'events',
    description:'Acknowledges one leased event idempotently.',
    input_schema:{
      type:'object',
      properties:{ event_id:STRING_ID, consumer:STRING_ID, lease_token:STRING_ID, acknowledged_at:TIME },
      required:['event_id','consumer','lease_token','acknowledged_at'],
      additionalProperties:false,
    },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'MEDIUM', health,
  }, input => service(db).ack(input));

  capability(bus, {
    id:'event.fail', name:'Échouer et replanifier un événement', category:'events',
    description:'Records one delivery failure and schedules retry or dead-letter state.',
    input_schema:{
      type:'object',
      properties:{
        event_id:STRING_ID, consumer:STRING_ID, lease_token:STRING_ID, error:STRING_4K,
        failed_at:TIME, retry_at:TIME, max_attempts:{ type:'integer', minimum:1, maximum:100 },
      },
      required:['event_id','consumer','lease_token','error','failed_at'],
      additionalProperties:false,
    },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'MEDIUM', health,
  }, input => service(db).fail(input));

  capability(bus, {
    id:'event.get', name:'Lire un événement', category:'events',
    description:'Reads one durable event delivery snapshot by identifier.',
    input_schema:{ type:'object', properties:{ event_id:STRING_ID }, required:['event_id'], additionalProperties:false },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'LOW', health,
  }, input => service(db).get(input));

  capability(bus, {
    id:'event.list', name:'Lister les événements', category:'events',
    description:'Reads a bounded deterministic Event Bus slice without mutating delivery state.',
    input_schema:{
      type:'object',
      properties:{
        topic:STRING_ID,
        status:{ type:'string', enum:['PENDING','LEASED','ACKED','DEAD'] },
        limit:{ type:'integer', minimum:1, maximum:500 },
      },
      additionalProperties:false,
    },
    output_schema:{ type:'array', items:{ type:'object', additionalProperties:true } },
    risk:'LOW', health,
  }, input => service(db).list(input));
}
