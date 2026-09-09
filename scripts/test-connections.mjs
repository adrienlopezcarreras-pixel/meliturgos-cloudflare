import {runConnectionTests,formatConnectionReport} from '../src/connectors/connection-test-runner.js';
const mode=process.argv.includes('--real')?'REAL':'MOCK';
console.log(formatConnectionReport(await runConnectionTests({mode,env:mode==='REAL'?process.env:{}})));
// Diagnostic exit: missing auth is a reported external blocker, not a mock test failure.
