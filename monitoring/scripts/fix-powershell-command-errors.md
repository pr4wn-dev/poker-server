# Fix PowerShell Command Syntax Errors

## Root Cause
PowerShell commands with complex nested quotes and escaping cause "The string is missing the terminator" errors.

## Solution
1. **Use simpler commands** - Break complex commands into multiple simple commands
2. **Avoid nested quotes** - Use variables instead of nested quotes
3. **Use the analyze-terminal-error.js script** - For terminal error analysis, use the dedicated script instead of inline PowerShell
4. **Use proper escaping** - When quotes are needed, use single quotes for outer strings and double quotes for inner strings (or vice versa)

## Best Practices
- For complex commands: Use dedicated scripts (e.g., `analyze-terminal-error.js`)
- For simple commands: Keep them simple, avoid nesting
- For JSON: Use `ConvertTo-Json` and store in variable first
- For Base64: Use variables to store encoded values before using in strings

## Example Fix
**BAD:**
```powershell
$response = Invoke-WebRequest -Uri "http://127.0.0.1:3001/monitor-terminal-command?args=$([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($command)))&output=$([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($output)))" -Method GET
```

**GOOD:**
```powershell
$commandEncoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($command))
$outputEncoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($output))
$uri = "http://127.0.0.1:3001/monitor-terminal-command?args=$commandEncoded&output=$outputEncoded"
$response = Invoke-WebRequest -Uri $uri -Method GET
```
