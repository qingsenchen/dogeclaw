---
name: weather
description: Look up current weather for a city or location.
metadata: {"dogeclaw":{"emoji":"🌤️","requires":{"tools":["curl"]}}}
---

# Weather Skill

Use this skill when the user asks about weather, temperature, rain, humidity, wind, or feels-like temperature.

If the user does not provide a location, ask for the location before using a tool.

Use `curl` to request wttr.in JSON. Build the command like this:

```bash
curl -sS --max-time 12 -H 'Accept: application/json' 'https://wttr.in/<location>?format=j1'
```

Replace `<location>` with the user's city, region, or place name. URL-encode spaces and special characters.

Read these fields from the JSON response:

- `nearest_area[0]` for the resolved location.
- `current_condition[0].weatherDesc[0].value` for the condition.
- `current_condition[0].temp_C` for temperature in Celsius.
- `current_condition[0].FeelsLikeC` for feels-like temperature in Celsius.
- `current_condition[0].humidity` for humidity.
- `current_condition[0].windspeedKmph` for wind speed.
- `current_condition[0].winddir16Point` for wind direction.
- `current_condition[0].observation_time` for observation time.

Answer naturally and cite wttr.in as the weather source when useful.
