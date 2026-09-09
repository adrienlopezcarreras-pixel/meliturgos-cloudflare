import { port } from '../core/contracts.js';
export const methods=['teach','critique','evaluate','proposeLesson'];
/** Outputs include {content,score,confidence,provenance:{teacher,session,turn}}.
 * Lessons stay proposed until a trusted confirmation operation.
 */
export const createTeacher = adapters => port('teacher',methods,adapters);
