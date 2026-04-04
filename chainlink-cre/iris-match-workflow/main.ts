import {
  CronCapability,
  ConfidentialHTTPClient,
  EVMClient,
  handler,
  Runner,
  type Runtime,
  type CronPayload,
} from "@chainlink/cre-sdk"
import { encodeAbiParameters, toHex } from "viem"

// ---------------------------------------------------------------------------
// Config injected from config.staging.json / config.production.json
// ---------------------------------------------------------------------------

type Config = {
  backendUrl: string
  irisVerifierAddress: string
  matchThreshold: number
  chainId: number
}

// ---------------------------------------------------------------------------
// Hamming distance — pure TypeScript, runs inside the TEE
// Operates on packed Uint8Array representations of iris codes.
// ---------------------------------------------------------------------------

function popcount8(byte: number): number {
  let count = 0
  let b = byte
  while (b) {
    count += b & 1
    b >>= 1
  }
  return count
}

// ---------------------------------------------------------------------------
// Helpers to decode the backend's template JSON into Uint8Array iris codes
// ---------------------------------------------------------------------------

interface TemplateCode {
  shape: number[]
  dtype: string
  data: string // hex-encoded raw bytes
}

interface TemplateResponse {
  walletAddress: string
  scanIrisCodes: TemplateCode[]
  scanMaskCodes: TemplateCode[]
  refIrisCodes: TemplateCode[]
  refMaskCodes: TemplateCode[]
  nonce: number
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function flattenCodes(codes: TemplateCode[]): Uint8Array {
  const parts = codes.map((c) => hexToBytes(c.data))
  const totalLen = parts.reduce((sum, p) => sum + p.length, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const p of parts) {
    result.set(p, offset)
    offset += p.length
  }
  return result
}

function maskedHammingDistance(
  scanCodes: TemplateCode[],
  scanMasks: TemplateCode[],
  refCodes: TemplateCode[],
  refMasks: TemplateCode[]
): number {
  const scanBits = flattenCodes(scanCodes)
  const refBits = flattenCodes(refCodes)
  const scanMask = flattenCodes(scanMasks)
  const refMask = flattenCodes(refMasks)

  const len = Math.min(scanBits.length, refBits.length)
  let diffBits = 0
  let validBits = 0

  for (let i = 0; i < len; i++) {
    const mask = scanMask[i] & refMask[i]
    const xor = (scanBits[i] ^ refBits[i]) & mask
    diffBits += popcount8(xor)
    validBits += popcount8(mask)
  }

  return validBits === 0 ? 1.0 : diffBits / validBits
}

// ---------------------------------------------------------------------------
// CRE Workflow — Iris biometric matching in a TEE
// ---------------------------------------------------------------------------

const onCronTrigger = (
  runtime: Runtime<Config>,
  _payload: CronPayload
): string => {
  const config = runtime.config
  runtime.log("Iris match workflow triggered")

  // Step 1: Fetch both templates via Confidential HTTP
  const confidentialHttp = new ConfidentialHTTPClient()

  const httpResult = confidentialHttp.sendRequest(runtime, {
    request: {
      url: `${config.backendUrl}/api/cre/pending`,
      method: "GET",
      multiHeaders: {
        "Authorization": { values: ["Bearer {{.backendApiKey}}"] },
        "Content-Type": { values: ["application/json"] },
      },
    },
  })

  const response = httpResult.result()

  if (response.statusCode === 204 || response.body.length === 0) {
    runtime.log("No pending iris match requests")
    return "no_pending"
  }

  if (response.statusCode !== 200) {
    runtime.log(`Backend error: ${response.statusCode}`)
    return "backend_error"
  }

  const bodyText = new TextDecoder().decode(response.body)
  const templateData: TemplateResponse = JSON.parse(bodyText)
  runtime.log(`Processing match for wallet ${templateData.walletAddress}`)

  // Step 2: Compute Hamming distance inside the TEE
  const distance = maskedHammingDistance(
    templateData.scanIrisCodes,
    templateData.scanMaskCodes,
    templateData.refIrisCodes,
    templateData.refMaskCodes
  )

  const matched = distance < config.matchThreshold
  const confidence = Math.round((1 - distance) * 100)
  const nonce = templateData.nonce

  runtime.log(
    `Match result: distance=${distance.toFixed(4)}, matched=${matched}, confidence=${confidence}`
  )

  // Step 3: Generate a signed report with the match result
  const encodedData = encodeAbiParameters(
    [
      { name: "wallet", type: "address" },
      { name: "matched", type: "bool" },
      { name: "confidence", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
    [
      templateData.walletAddress as `0x${string}`,
      matched,
      BigInt(confidence),
      BigInt(nonce),
    ]
  )

  // Convert hex-encoded ABI data to Uint8Array for the report payload
  const payloadBytes = hexToBytes(encodedData.slice(2))
  const payloadBase64 = btoa(String.fromCharCode(...payloadBytes))

  const reportResult = runtime.report({
    encodedPayload: payloadBase64,
    encoderName: "evm-abi",
  })
  const report = reportResult.result()

  // Step 4: Submit the signed report on-chain via the KeystoneForwarder
  const evmClient = new EVMClient(
    EVMClient.SUPPORTED_CHAIN_SELECTORS["ethereum-testnet-sepolia"]
  )

  const receiverBytes = hexToBytes(config.irisVerifierAddress.slice(2))

  evmClient.writeReport(runtime, {
    receiver: receiverBytes,
    report: report,
    $report: true,
  })

  runtime.log(`Report submitted on-chain for wallet ${templateData.walletAddress}`)

  // Step 5: Acknowledge the scan so the backend clears it
  try {
    confidentialHttp.sendRequest(runtime, {
      request: {
        url: `${config.backendUrl}/api/cre/ack/${nonce}`,
        method: "POST",
        multiHeaders: {
          "Authorization": { values: ["Bearer {{.backendApiKey}}"] },
        },
      },
    })
  } catch {
    runtime.log("Warning: failed to acknowledge scan, will be retried")
  }

  return `matched=${matched},confidence=${confidence},wallet=${templateData.walletAddress}`
}

// ---------------------------------------------------------------------------
// Workflow initialization
// ---------------------------------------------------------------------------

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()

  // Poll every 30 seconds for pending iris match requests
  return [handler(cron.trigger({ schedule: "*/30 * * * * *" }), onCronTrigger)]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
