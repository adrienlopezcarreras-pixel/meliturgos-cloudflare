const names=['DB','MEDIA_BUCKET','AI'];
for (const name of names) console.log(`${name}_BINDING_PRESENT=${process.env[name]?'YES':'NO'}\n${name==='AI'?'AI_MODE=MOCK (no paid call)':''}`);
console.log('D1_READ=NOT_RUN\nD1_WRITE_TEST_TEMPORARY=NOT_RUN\nR2_TEMP_WRITE=NOT_RUN\nSTATUS=PARTIAL_LOCAL_REPORT');
