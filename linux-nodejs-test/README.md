# signageOS Custom Script boilerplate

This repository serves as a starting point for developing Custom Scripts for signageOS devices.
It represents one Custom Script with implementations for any number of target platforms.

## Quick start

Clone this repository. 

Then run:

```bash
sos custom-script upload
```

this will upload the Custom Script to signageOS platform.
It will also assign it a uid and add it to `.sosconfig.json` file.

Then you can execute the Custom Script on a device either via the Box console or via the signageOS API.

<!-- TODO add Box screenshot and link to API endpoint -->

## How it works

### Config file

When calling `sos custom-script upload`, it reads the `.sosconfig.json` file. This file contains several fields:

- `name` - Custom Script will be created and displayed using this name
-  `description` - Short description of the Custom Script that will be displayed in Custom Script detail. It should help the user to understand what the Custom Script does.
-  `version` - Used for version control. Must follow the semantic versioning format. Each time the Custom Version changes, it should be incremented, however it's possible to overwrite the same version as long as its not published.
-  `dangerLevel` - Can be one of the following: `low`, `medium`, `high`. It represents the danger level of the Custom Script. It should be set according to the potential impact of the Custom Script on the device.
- `platforms` - List of platforms and their files that will be uploaded to the signageOS platform.
- `configDefinition` - list of accepted configuration parameters.

### Platforms

The general structure of the `platforms` field is as follows:

```json
{
	"{platform}": {
		"rootDir": "{rootDir}",
		"mainFile": "{mainFile}",
		"runtime": "{runtime}"
	}
}
```

- `{platform}` - name of the platform. It should be one of: `default`, `tizen`, `webos`, `android`, `linux`, `windows`, `brightsign`
- `{rootDir}` - relative path to the platform implementation. This is where the platform-specific files are located in this repository.
- `{mainFile}` - entry point of the platform implementation. This file will be executed
- `{runtime}` - runtime of the platform. It should be one of: `ps1`, `bash`, `sh`, `nodejs`, `browser`, `brs`

### Config Definition

`configDefinition` is a mandatory item, keep it empty if you do not need any variables (`"configDefinition": []`).