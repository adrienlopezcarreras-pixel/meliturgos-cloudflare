$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
Add-Type -AssemblyName System.Net.Http
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\..\assets\MEL-Computer-Companion.ps1'))
$start=$source.IndexOf('function Invoke-OllamaWithCooperativeCancel(')
$end=$source.IndexOf('function Assert-SovereigntyAiPreflight(',$start)
if($start -lt 0 -or $end -le $start){throw 'CANCELLABLE_OLLAMA_FUNCTION_NOT_FOUND'}
# Evaluate only this HTTP helper in the test process. Do not start MEL,
# install a model, launch a real Ollama service or contact the Internet.
Invoke-Expression $source.Substring($start,$end-$start)
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
public sealed class MelMockOllama : IDisposable {
    private readonly TcpListener listener;
    private readonly Thread worker;
    private readonly int latency;
    public readonly int Port;
    public MelMockOllama(int delayMs) {
        latency=delayMs;
        listener=new TcpListener(IPAddress.Loopback,0);
        listener.Start();
        Port=((IPEndPoint)listener.LocalEndpoint).Port;
        worker=new Thread(Serve);
        worker.IsBackground=true;
        worker.Start();
    }
    void Serve() {
        try {
            using(var socket=listener.AcceptTcpClient())
            using(var stream=socket.GetStream()) {
                socket.ReceiveTimeout=7000;
                int seen=0;
                var header=new MemoryStream();
                while(seen<4 && header.Length<16384) {
                    int b=stream.ReadByte();
                    if(b<0)return;
                    header.WriteByte((byte)b);
                    if ((seen==0 || seen==2) && b==13)seen++;
                    else if((seen==1||seen==3)&&b==10)seen++;
                    else seen=b==13?1:0;
                }
                var lines=Encoding.ASCII.GetString(header.ToArray()).Split(new string[]{"\r\n"},StringSplitOptions.None);
                int remaining=0;
                foreach(var line in lines) {
                    if(line.StartsWith("Content-Length:",StringComparison.OrdinalIgnoreCase))
                       int.TryParse(line.Substring("Content-Length:".Length).Trim(),out remaining);
                }
                byte[] buffer=new byte[4096];
                while(remaining>0) {
                    int n=stream.Read(buffer,0,Math.Min(buffer.Length,remaining));
                    if(n<=0)return;remaining-=n;
                }
                Thread.Sleep(latency);
                byte[] body=Encoding.UTF8.GetBytes("{\"message\":{\"content\":\"MOCK_OK\"}}");
                var head=Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "+body.Length+"\r\nConnection: close\r\n\r\n");
                stream.Write(head,0,head.Length);
                stream.Write(body,0,body.Length);
                stream.Flush();
            }
        } catch (Exception) { }
    }
    public void Dispose(){
        try{listener.Stop();}catch{}
        try{if(worker.IsAlive)worker.Join(700);}catch{}
    }
}
'@
$script:Checks=0
$script:RevokeOnCheck=0
function Get-LocalComputeProfile {
  $script:Checks++
  if($script:RevokeOnCheck -gt 0 -and $script:Checks -ge $script:RevokeOnCheck){return 'off'}
  return 'light'
}
function Get-LocalGpuConsent {return $false}
function CallMock([int]$delay,[long]$deadline) {
  $server=[MelMockOllama]::new($delay)
  try {
    return Invoke-OllamaWithCooperativeCancel -uri ("http://127.0.0.1:"+$server.Port+"/api/chat") -json '{"model":"mock","stream":false}' -timeoutSec 6 -profile 'light' -gpuConsent $false -deadlineMs $deadline
  } finally {$server.Dispose()}
}
function ExpectCode([string]$code,[scriptblock]$action) {
  try { [void](& $action);throw 'EXPECTED_FAILURE_NOT_THROWN' }
  catch {if([string]$_.Exception.Message -ne $code){throw ("Expected "+$code+", got "+$_.Exception.Message)}}
}
$script:Checks=0
$script:RevokeOnCheck=0
$result=CallMock 25 ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+5000)
if($result.message.content -ne 'MOCK_OK'){throw 'VALID_LOOPBACK_ANSWER_LOST'}
$script:Checks=0
$script:RevokeOnCheck=2
ExpectCode 'SOVEREIGNTY_AI_LOCAL_CONSENT_REVOKED' {CallMock 1600 ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+5000)}
$script:Checks=0
$script:RevokeOnCheck=0
ExpectCode 'SOVEREIGNTY_AI_LOCAL_DEADLINE_EXPIRED' {CallMock 1800 ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+350)}
Write-Output 'Ollama cancellable HTTP loopback tests PASS (synthetic only)'
