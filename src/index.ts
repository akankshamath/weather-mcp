import { webcrypto } from 'node:crypto'
if (!globalThis.crypto) globalThis.crypto = webcrypto as any

import { Hono } from 'hono'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPTransport } from '@hono/mcp'
import { z } from 'zod'
import { handle } from 'hono/aws-lambda'

type Env = {
  OPENWEATHER_API_KEY: string
}

const app = new Hono<{ Bindings: Env }>()

const createMcpServer = (env: Env) => {
  const mcpServer = new McpServer({
    name: 'my-mcp-server',
    version: '1.0.0',
    capabilities: {
      tools: {},
    },
  })

  mcpServer.tool(
    'get-weather',
    'Get current weather from OpenWeatherMap',
    {
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    },
    async ({ lat, lon }) => {
      const API_KEY = env.OPENWEATHER_API_KEY
      
      if (!API_KEY) {
        return {
          content: [{ type: 'text', text: 'OpenWeather API key not configured.' }],
        }
      }

      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`

      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Error ${res.status}`)
        
        interface WeatherResponse {
          weather: { description: string }[]
          main: { temp: number }
          wind: { speed: number }
        }
        
        const data = await res.json() as WeatherResponse
        console.log(data.weather[0].description)

        const description = data.weather?.[0]?.description ?? 'No description'
        const temp = data.main?.temp ?? 'N/A'
        const wind = data.wind?.speed ?? 'N/A'

        const text = `Weather: ${description}\n Temp: ${temp}°C\n  Wind: ${wind} m/s`

        return {
          content: [{ type: 'text', text }],
        }
      } catch (err) {
        console.error(err)
        return {
          content: [{ type: 'text', text: 'Failed to fetch weather data.' }],
        }
      }
    }
  )

  return mcpServer
}

app.use('*', async(c, next) => {
  if (!c.env?.OPENWEATHER_API_KEY && process.env.OPENWEATHER_API_KEY) {
    c.env = {
      OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY || ""
    } as Env
  }
  await next()
})

app.all('/mcp', async (c) => {
  const mcpServer = createMcpServer(c.env)
  const transport = new StreamableHTTPTransport()
  await mcpServer.connect(transport)
  return transport.handleRequest(c)
})

export const handler = handle(app)
export default app