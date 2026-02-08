# Unity C# Client Script Specification

**Status**: 📋 **SPECIFICATION READY** - Server-side complete, Unity client implementation needed

**Purpose**: Create `CerberusStateReporter.cs` in `poker-client-unity` repo to report Unity UI/audio/animation state to Cerberus.

---

## Overview

The server-side `UnityStateReporter.js` is complete and ready to receive state reports. The Unity client needs to send state reports via Socket.IO `report_unity_state` event.

---

## Required Unity Script: `CerberusStateReporter.cs`

### Location
`poker-client-unity/Assets/Scripts/Cerberus/CerberusStateReporter.cs`

### Dependencies
- Socket.IO client (already in project)
- Unity UI components (Text, Image, Button, etc.)
- Unity Audio components (AudioSource, etc.)
- Unity Animator components

---

## Implementation Specification

### Class Structure

```csharp
using System;
using System.Collections.Generic;
using UnityEngine;
using SocketIOClient;

public class CerberusStateReporter : MonoBehaviour
{
    [Header("Configuration")]
    public float reportInterval = 5.0f; // Report every 5 seconds
    public bool reportOnStateChange = true; // Also report when state changes
    
    [Header("UI Components to Monitor")]
    public List<Text> uiLabels = new List<Text>();
    public List<Image> uiImages = new List<Image>();
    public List<Button> uiButtons = new List<Button>();
    public List<GameObject> uiPanels = new List<GameObject>();
    
    [Header("Audio Components to Monitor")]
    public List<AudioSource> audioSources = new List<AudioSource>();
    
    [Header("Animation Components to Monitor")]
    public List<Animator> animators = new List<Animator>();
    
    private SocketIO socket;
    private float lastReportTime = 0f;
    private Dictionary<string, object> lastReportedState = new Dictionary<string, object>();
    
    void Start()
    {
        // Get Socket.IO instance (assuming it's already set up in your project)
        socket = FindObjectOfType<SocketManager>()?.socket; // Adjust based on your Socket.IO setup
        
        if (socket == null)
        {
            Debug.LogWarning("[Cerberus] Socket.IO not found - state reporting disabled");
            enabled = false;
        }
    }
    
    void Update()
    {
        // Report on interval
        if (Time.time - lastReportTime >= reportInterval)
        {
            ReportState();
            lastReportTime = Time.time;
        }
        
        // Report on state change (if enabled)
        if (reportOnStateChange)
        {
            if (HasStateChanged())
            {
                ReportState();
            }
        }
    }
    
    void ReportState()
    {
        if (socket == null || !socket.Connected) return;
        
        var stateReport = new Dictionary<string, object>
        {
            ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ["uiState"] = GetUIState(),
            ["audioState"] = GetAudioState(),
            ["animationState"] = GetAnimationState(),
            ["gameState"] = GetGameState()
        };
        
        socket.EmitAsync("report_unity_state", stateReport);
    }
    
    Dictionary<string, object> GetUIState()
    {
        var uiState = new Dictionary<string, object>
        {
            ["labels"] = GetLabelsState(),
            ["images"] = GetImagesState(),
            ["buttons"] = GetButtonsState(),
            ["panels"] = GetPanelsState()
        };
        
        return uiState;
    }
    
    List<Dictionary<string, object>> GetLabelsState()
    {
        var labels = new List<Dictionary<string, object>>();
        
        foreach (var label in uiLabels)
        {
            if (label == null) continue;
            
            labels.Add(new Dictionary<string, object>
            {
                ["id"] = label.name,
                ["text"] = label.text ?? "",
                ["visible"] = label.gameObject.activeInHierarchy,
                ["enabled"] = label.enabled,
                ["color"] = ColorToHex(label.color)
            });
        }
        
        return labels;
    }
    
    List<Dictionary<string, object>> GetImagesState()
    {
        var images = new List<Dictionary<string, object>>();
        
        foreach (var image in uiImages)
        {
            if (image == null) continue;
            
            images.Add(new Dictionary<string, object>
            {
                ["id"] = image.name,
                ["sprite"] = image.sprite != null ? image.sprite.name : "",
                ["visible"] = image.gameObject.activeInHierarchy,
                ["enabled"] = image.enabled,
                ["color"] = ColorToHex(image.color)
            });
        }
        
        return images;
    }
    
    List<Dictionary<string, object>> GetButtonsState()
    {
        var buttons = new List<Dictionary<string, object>>();
        
        foreach (var button in uiButtons)
        {
            if (button == null) continue;
            
            buttons.Add(new Dictionary<string, object>
            {
                ["id"] = button.name,
                ["text"] = button.GetComponentInChildren<Text>()?.text ?? "",
                ["interactable"] = button.interactable,
                ["visible"] = button.gameObject.activeInHierarchy
            });
        }
        
        return buttons;
    }
    
    List<Dictionary<string, object>> GetPanelsState()
    {
        var panels = new List<Dictionary<string, object>>();
        
        foreach (var panel in uiPanels)
        {
            if (panel == null) continue;
            
            panels.Add(new Dictionary<string, object>
            {
                ["id"] = panel.name,
                ["visible"] = panel.activeInHierarchy,
                ["active"] = panel.activeSelf
            });
        }
        
        return panels;
    }
    
    Dictionary<string, object> GetAudioState()
    {
        var audioState = new Dictionary<string, object>
        {
            ["sources"] = GetAudioSourcesState()
        };
        
        return audioState;
    }
    
    List<Dictionary<string, object>> GetAudioSourcesState()
    {
        var sources = new List<Dictionary<string, object>>();
        
        foreach (var audioSource in audioSources)
        {
            if (audioSource == null) continue;
            
            sources.Add(new Dictionary<string, object>
            {
                ["id"] = audioSource.name,
                ["playing"] = audioSource.isPlaying,
                ["volume"] = audioSource.volume,
                ["clip"] = audioSource.clip != null ? audioSource.clip.name : "",
                ["loop"] = audioSource.loop,
                ["mute"] = audioSource.mute
            });
        }
        
        return sources;
    }
    
    Dictionary<string, object> GetAnimationState()
    {
        var animationState = new Dictionary<string, object>
        {
            ["animators"] = GetAnimatorsState()
        };
        
        return animationState;
    }
    
    List<Dictionary<string, object>> GetAnimatorsState()
    {
        var animators = new List<Dictionary<string, object>>();
        
        foreach (var animator in this.animators)
        {
            if (animator == null) continue;
            
            var parameters = new List<Dictionary<string, object>>();
            foreach (var param in animator.parameters)
            {
                var paramValue = new Dictionary<string, object>
                {
                    ["name"] = param.name,
                    ["type"] = param.type.ToString()
                };
                
                switch (param.type)
                {
                    case AnimatorControllerParameterType.Bool:
                        paramValue["value"] = animator.GetBool(param.name);
                        break;
                    case AnimatorControllerParameterType.Int:
                        paramValue["value"] = animator.GetInteger(param.name);
                        break;
                    case AnimatorControllerParameterType.Float:
                        paramValue["value"] = animator.GetFloat(param.name);
                        break;
                }
                
                parameters.Add(paramValue);
            }
            
            animators.Add(new Dictionary<string, object>
            {
                ["id"] = animator.name,
                ["enabled"] = animator.enabled,
                ["speed"] = animator.speed,
                ["parameters"] = parameters,
                ["currentState"] = animator.GetCurrentAnimatorStateInfo(0).fullPathHash.ToString()
            });
        }
        
        return animators;
    }
    
    Dictionary<string, object> GetGameState()
    {
        // Add any game-specific state here
        // This is optional and can be customized based on your game needs
        return new Dictionary<string, object>
        {
            ["scene"] = UnityEngine.SceneManagement.SceneManager.GetActiveScene().name,
            ["time"] = Time.time,
            ["frameCount"] = Time.frameCount
        };
    }
    
    bool HasStateChanged()
    {
        var currentState = new Dictionary<string, object>
        {
            ["ui"] = GetUIState(),
            ["audio"] = GetAudioState(),
            ["animation"] = GetAnimationState()
        };
        
        // Simple comparison (can be enhanced)
        var currentJson = JsonUtility.ToJson(currentState);
        var lastJson = lastReportedState.Count > 0 ? JsonUtility.ToJson(lastReportedState) : "";
        
        if (currentJson != lastJson)
        {
            lastReportedState = currentState;
            return true;
        }
        
        return false;
    }
    
    string ColorToHex(Color color)
    {
        return $"#{ColorUtility.ToHtmlStringRGBA(color)}";
    }
}
```

---

## Integration Steps

### 1. Create Script File
- Create `Assets/Scripts/Cerberus/CerberusStateReporter.cs`
- Copy the implementation above

### 2. Add to Scene
- Create empty GameObject named "CerberusStateReporter"
- Add `CerberusStateReporter` component
- Configure UI/Audio/Animation components in inspector

### 3. Configure Components
- Drag UI Text components to `uiLabels` list
- Drag UI Image components to `uiImages` list
- Drag UI Button components to `uiButtons` list
- Drag UI Panel GameObjects to `uiPanels` list
- Drag AudioSource components to `audioSources` list
- Drag Animator components to `animators` list

### 4. Connect Socket.IO
- Ensure Socket.IO client is initialized before `CerberusStateReporter.Start()`
- Adjust `socket = FindObjectOfType<SocketManager>()?.socket;` to match your Socket.IO setup

### 5. Test
- Run Unity client
- Check server logs for `[UNITY_STATE]` entries
- Verify state reports are being received

---

## Expected Server Response

When Unity sends `report_unity_state`, the server will:
1. Receive the event in `SocketHandler.js`
2. Pass to `UnityStateReporter.handleUnityStateReport()`
3. Normalize and store state in `StateStore`
4. Verify state against server expectations
5. Detect any mismatches and report issues

---

## Data Format

### UI State Format
```json
{
  "labels": [
    {
      "id": "PlayerNameLabel",
      "text": "Player 1",
      "visible": true,
      "enabled": true,
      "color": "#FFFFFFFF"
    }
  ],
  "images": [
    {
      "id": "PlayerAvatar",
      "sprite": "avatar_1",
      "visible": true,
      "enabled": true,
      "color": "#FFFFFFFF"
    }
  ],
  "buttons": [
    {
      "id": "FoldButton",
      "text": "Fold",
      "interactable": true,
      "visible": true
    }
  ],
  "panels": [
    {
      "id": "GamePanel",
      "visible": true,
      "active": true
    }
  ]
}
```

### Audio State Format
```json
{
  "sources": [
    {
      "id": "BackgroundMusic",
      "playing": true,
      "volume": 0.5,
      "clip": "bgm_main",
      "loop": true,
      "mute": false
    }
  ]
}
```

### Animation State Format
```json
{
  "animators": [
    {
      "id": "PlayerAnimator",
      "enabled": true,
      "speed": 1.0,
      "parameters": [
        {
          "name": "isWalking",
          "type": "Bool",
          "value": true
        }
      ],
      "currentState": "1234567890"
    }
  ]
}
```

---

## Notes

- **Performance**: Reporting every 5 seconds is recommended. Adjust `reportInterval` as needed.
- **State Change Detection**: Enable `reportOnStateChange` for real-time reporting, but be aware of performance impact.
- **Component Lists**: Populate component lists in Unity Inspector for automatic monitoring.
- **Socket.IO**: Ensure Socket.IO is connected before reporting starts.

---

## Status

- ✅ Server-side ready (`UnityStateReporter.js`)
- ✅ Socket.IO event handler ready (`SocketHandler.js`)
- ✅ Event constant defined (`Events.js`)
- 📋 Unity C# script needs implementation (this specification)

---

**Next Step**: Implement `CerberusStateReporter.cs` in `poker-client-unity` repo using this specification.
