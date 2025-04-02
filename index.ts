type frame = {
    rotation: {
        [uuid: string]: {
            x?: number;
            y?: number;
            z?: number;
        };
    };
    position: {
        [uuid: string]: {
            x?: number;
            y?: number;
            z?: number;
        };
    };
    scale: {
        [uuid: string]: {
            x?: number;
            y?: number;
            z?: number;
        };
    }
}

(() => {
    function logger(..._: any[]) {
        console.log("[Animated Display] " + [...arguments].join(" "))
    }

    const registered: Deletable[] = [];

    BBPlugin.register('AnimatedDisplay', {
        title: 'Animated Display',
        author: 'Toi Community',
        icon: 'star',
        description: 'Animate by using Display property',
        tags: ["Minecraft: Java Edition", "Animation"],
        version: '0.0.1',
        variant: 'desktop',
        min_version: '4.10.4',
        await_loading: true,
        onload: () => {
            logger("Loading...");
            logger("Checking Codecs...");

            const identifer = "ADModel";
            if (!Codecs.hasOwnProperty(identifer)) {
                logger("The Codec have not registered yet");
                logger("Attepting to register the Codec:", identifer);

                new Blockbench.Codec(identifer, {
                    name: "AnimatedDisplay",
                    remember: true,
                    extension: "admodel",
                    load_filter: {
                        extensions: ["admodel", "mcmodel"],
                        type: "json",
                    },
                    load(model, file) {
                        logger("Loading model...");
                        settings.dialog_save_codec.value = true;
                        setupProject(Formats[model.meta.model_format] || Formats.free);

                        var name = pathToName(file.path, true);
                        if (file.path && isApp && !file.no_file) {
                            let project = Project;
                            if (Project) {
                                Project.export_path = file.path;
                                Project.name = pathToName(name, false);
                            }
                            addRecentProject({
                                name,
                                path: file.path,
                                icon: "animation",
                            });
                            setTimeout(() => {
                                if (Project == project) updateRecentProjectThumbnail();
                            }, 200);
                        }
                        this.parse!(model, file.path);

                        if (Modes.animate && !AnimationItem.selected && AnimationItem.all[0]) {
                            AnimationItem.all[0].select();
                        }
                    },
                    export() {
                        logger("Exporting...");
                        Blockbench.export(
                            {
                                resource_id: "animated_display.export",
                                type: this.name,
                                extensions: [this.extension],
                                name: this.fileName!(),
                                startpath: this.startPath!(),
                                content: isApp ? null : this.compile!(),
                                custom_writer: isApp
                                    ? (content, path) => {
                                        // Path needs to be changed before compiling for relative resource paths
                                        if (Project) {
                                            Project.save_path = path;
                                        }
                                        content = this.compile!();
                                        this.write!(content, path);
                                    }
                                    : undefined,
                            },
                            (path) => this.afterDownload!(path)
                        );
                    },
                    compile(options) {
                        logger("Compiling...");
                        if (!options) options = 0;
                        if (!Project) {
                            return
                        }
                        var model: any = {
                            meta: {
                                format_version: 0.1,
                                creation_time: Math.round(new Date().getTime() / 1000),
                                backup: options.backup ? true : undefined,
                                model_format: Format.id,
                                box_uv: Project.box_uv,
                            },
                        };

                        for (const key in ModelProject.properties) {
                            if (ModelProject.properties[key].export == false) continue;
                            ModelProject.properties[key].copy(Project, model);
                        }

                        if (Project.overrides) {
                            model.overrides = Project.overrides;
                        }
                        model.resolution = {
                            width: Project.texture_width || 16,
                            height: Project.texture_height || 16,
                        };
                        if (options.flag) {
                            model.flag = options.flag;
                        }

                        if (options.editor_state) {
                            Project.saveEditorState();
                            model.editor_state = {
                                save_path: Project.save_path,
                                export_path: Project.export_path,
                                saved: Project.saved,
                                added_models: Project.added_models,
                                mode: Project.mode,
                                tool: Project.tool,
                                display_uv: Project.display_uv,
                                exploded_view: Project.exploded_view,
                                uv_viewport: Project.uv_viewport,
                                previews: JSON.parse(JSON.stringify(Project.previews)),

                                selected_elements: Project.selected_elements.map((e) => e.uuid),
                                selected_group: Project.selected_group?.uuid,
                                mesh_selection: JSON.parse(JSON.stringify(Project.mesh_selection)),
                                selected_faces: Project.selected_faces,
                                selected_texture: Project.selected_texture?.uuid,
                            };
                        }

                        if (!(Format.id == "skin" && model.skin_model)) {
                            model.elements = [];
                            elements.forEach((el) => {
                                if (el.getSaveCopy) {
                                    const obj = el.getSaveCopy(model.meta);
                                    model.elements.push(obj);
                                }
                            });
                            model.outliner = compileGroups(true);
                        }

                        model.textures = [];
                        Texture.all.forEach((tex) => {
                            var t = tex.getSaveCopy();
                            if (
                                isApp &&
                                Project &&
                                Project.save_path &&
                                tex.path &&
                                PathModule.isAbsolute(tex.path)
                            ) {
                                let relative = PathModule.relative(Project.save_path, tex.path);
                                t.relative_path = relative.replace(/\\/g, "/");
                            }
                            if (
                                options.bitmaps != false &&
                                (Settings.get("embed_textures") ||
                                    options.backup ||
                                    options.bitmaps == true)
                            ) {
                                t.source = tex.getDataURL();
                                t.internal = true;
                            }
                            if (options.absolute_paths == false) delete t.path;
                            model.textures.push(t);
                        });

                        if (Blockbench.Animation.all.length) {
                            model.animations = [];
                            Blockbench.Animation.all.forEach((a) => {
                                model.animations.push(
                                    a.getUndoCopy(
                                        { bone_names: true, absolute_paths: options.absolute_paths },
                                        true
                                    )
                                );
                            });
                        }
                        if (AnimationController.all.length) {
                            model.animation_controllers = [];
                            AnimationController.all.forEach((a) => {
                                model.animation_controllers.push(a.getUndoCopy());
                            });
                        }
                        if (Interface.Panels.variable_placeholders.inside_vue.$data.text) {
                            model.animation_variable_placeholders =
                                Interface.Panels.variable_placeholders.inside_vue.$data.text;
                        }

                        if (
                            Format.display_mode &&
                            Object.keys(Project.display_settings).length >= 1
                        ) {
                            var new_display: any = {};
                            var entries = 0;
                            for (var i in DisplayMode.slots) {
                                var key = DisplayMode.slots[i];
                                if (
                                    DisplayMode.slots.hasOwnProperty(i) &&
                                    Project &&
                                    Project.display_settings[key].export
                                ) {
                                    new_display[key] = Project.display_settings[key].export!();
                                    entries++;
                                }
                            }
                            if (entries) {
                                model.display = new_display;
                            }
                        }

                        if (!options.backup && options.reference_images != false) {
                            // Reference Images
                            const reference_images: ReferenceImage[] = [];

                            for (const reference of Project.reference_images) {
                                reference_images.push(reference.getSaveCopy());
                            }
                            if (reference_images.length) {
                                model.reference_images = reference_images;
                            }
                        }

                        if (Object.keys(Project.export_options).length) {
                            model.export_options = {};
                            for (const codec_id in Project.export_options) {
                                if (Object.keys(Project.export_options[codec_id]).length) {
                                    model.export_options[codec_id] = Object.assign(
                                        {},
                                        Project.export_options[codec_id]
                                    );
                                }
                            }
                        }
                        console.log(model);

                        if (options.history) {
                            model.history = [];
                            Undo.history.forEach((h) => {
                                var e = {
                                    before: omitKeys(h.before, ["aspects"]),
                                    post: omitKeys(h.post, ["aspects"]),
                                    action: h.action,
                                    time: h.time,
                                };
                                model.history.push(e);
                            });
                            model.history_index = Undo.index;
                        }

                        Blockbench.dispatchEvent("save_project", { model, options });
                        this.dispatchEvent!("compile", { model, options });

                        if (options.raw) {
                            return model;
                        } else if (options.compressed) {
                            var json_string = JSON.stringify(model);
                            var compressed =
                                "<lz>" +
                                LZUTF8.compress(json_string, {
                                    outputEncoding: "StorageBinaryString",
                                });
                            return compressed;
                        } else {
                            if (Settings.get("minify_bbmodel") || options.minify) {
                                return JSON.stringify(model);
                            } else {
                                return compileJSON(model);
                            }
                        }
                    },
                    parse(model, path) {
                        logger("Parsing...");
                        if (!Project) {
                            return
                        }

                        if (model.meta.model_format) {
                            if (!Formats[model.meta.model_format]) {
                                let supported_plugins = Plugins.all.filter(plugin => {
                                    return plugin.contributes?.formats?.includes(model.meta.model_format);
                                })
                                let commands: { [x: string]: any } = {};
                                for (let plugin of supported_plugins) {
                                    commands[plugin.id] = {
                                        icon: plugin.icon,
                                        text: tl('message.invalid_format.install_plugin', [plugin.title])
                                    }
                                }
                                Blockbench.showMessageBox({
                                    translateKey: 'invalid_format',
                                    message: tl('message.invalid_format.message', [model.meta.model_format]),
                                    commands,
                                }, plugin_id => {
                                    let plugin = plugin_id && supported_plugins.find(p => p.id == plugin_id);
                                    if (plugin && Plugins.dialog.content_vue) {
                                        BarItems.plugins_window.getNode().click();
                                        // Plugins.dialog.content_vue.selectPlugin(plugin);
                                    }
                                })
                            }
                            var format = Formats[model.meta.model_format] || Formats.free;
                            format.select()
                        }

                        Blockbench.dispatchEvent('load_project', { model, path });
                        this.dispatchEvent!('parse', { model })

                        if (model.meta.box_uv !== undefined && Format.optional_box_uv) {
                            Project.box_uv = model.meta.box_uv
                        }

                        for (var key in ModelProject.properties) {
                            ModelProject.properties[key].merge(Project, model)
                        }
                        if (path && path != 'backup.bbmodel') {
                            Project.name = pathToName(path, false);
                        }

                        if (model.overrides) {
                            Project.overrides = model.overrides;
                        }
                        if (model.resolution !== undefined) {
                            Project.texture_width = model.resolution.width;
                            Project.texture_height = model.resolution.height;
                        }

                        if (model.texture_groups) {
                            model.texture_groups.forEach((tex_group: TextureGroupOptions) => {
                                new TextureGroup(tex_group, tex_group.uuid).add();
                            })
                        }
                        if (model.textures) {
                            model.textures.forEach((tex: TextureData) => {
                                var tex_copy = new Texture(tex, tex.uuid).add(false);
                                if (isApp && tex.relative_path && Project && Project.save_path) {
                                    let resolved_path = PathModule.resolve(PathModule.dirname(Project.save_path), tex.relative_path);
                                    if (fs.existsSync(resolved_path)) {
                                        tex_copy.loadContentFromPath(resolved_path)
                                        return;
                                    }
                                }
                                if (isApp && tex.path && fs.existsSync(tex.path) && !model.meta.backup) {
                                    tex_copy.loadContentFromPath(tex.path)
                                    return;
                                }
                                if (tex.source && tex.source.substr(0, 5) == 'data:') {
                                    tex_copy.fromDataURL(tex.source)
                                }
                            })
                        }

                        if (model.skin_model) {
                            Codecs.skin_model.rebuild!(model.skin_model, model.skin_pose);
                        }
                        if (model.elements) {
                            let default_texture = Texture.getDefault();
                            model.elements.forEach(function (template: Cube) {
                                const copy = OutlinerElement.fromSave(template, true) as Cube
                                for (let face in copy.faces) {
                                    if (!Format.single_texture && template.faces) {
                                        let texture = template.faces[face].texture !== null && Texture.all[Number(template.faces[face].texture)]
                                        if (texture) {
                                            copy.faces[face].texture = texture.uuid
                                        }
                                    } else if (default_texture && copy.faces && copy.faces[face].texture !== null && !Format.single_texture_default) {
                                        copy.faces[face].texture = default_texture.uuid
                                    }
                                }
                                copy.init()
                            })
                        }
                        if (model.outliner) {
                            parseGroups(model.outliner)
                        }
                        if (model.animations) {
                            model.animations.forEach((ani: _Animation) => {
                                var base_ani = new Blockbench.Animation()
                                base_ani.uuid = ani.uuid;
                                base_ani.extend(ani).add();
                                if (isApp && Format.animation_files) {
                                    base_ani.saved_name = base_ani.name;
                                }
                            })
                        }
                        if (model.animation_controllers) {
                            model.animation_controllers.forEach((ani: AnimationController) => {
                                var base_ani = new AnimationController()
                                base_ani.uuid = ani.uuid;
                                base_ani.extend(ani).add();
                                if (isApp && Format.animation_files) {
                                    base_ani.saved_name = base_ani.name;
                                }
                            })
                        }
                        if (model.animation_variable_placeholders) {
                            Interface.Panels.variable_placeholders.inside_vue.$data.text = model.animation_variable_placeholders;
                        }
                        if (model.display !== undefined) {
                            DisplayMode.loadJSON(model.display)
                        }
                        if (model.backgrounds) {
                            for (let key in model.backgrounds) {
                                let template = model.backgrounds[key];
                                let reference = new ReferenceImage({
                                    position: [template.x, template.y + template.size / 2],
                                    size: [template.size / 2, template.size / 2],
                                    layer: template.lock ? 'blueprint' : 'background',
                                    source: template.image,
                                    name: (template.image && !template.image.startsWith('data:')) ? template.image.split([/[/\\]/]).last() : 'Reference'
                                }).addAsReference();
                                /*if (Project.backgrounds.hasOwnProperty(key)) {
                
                                    let store = model.backgrounds[key]
                                    let real = Project.backgrounds[key]
                
                                    if (store.image	!== undefined) {real.image = store.image}
                                    if (store.size	!== undefined) {real.size = store.size}
                                    if (store.x		!== undefined) {real.x = store.x}
                                    if (store.y		!== undefined) {real.y = store.y}
                                    if (store.lock	!== undefined) {real.lock = store.lock}
                                }*/
                            }
                        }
                        if (model.reference_images) {
                            model.reference_images.forEach((template: any) => {
                                new ReferenceImage(template).addAsReference();
                            })
                        }
                        if (model.export_options) {
                            for (let codec_id in model.export_options) {
                                Project.export_options[codec_id] = Object.assign({}, model.export_options[codec_id]);
                            }
                        }
                        if (model.history) {
                            Undo.history = model.history.slice()
                            Undo.index = model.history_index;
                        }

                        Canvas.updateAllBones()
                        Canvas.updateAllPositions()
                        Canvas.updateAllFaces()
                        ReferenceImage.updateAll();
                        Validator.validate()
                        this.dispatchEvent!('parsed', { model })

                        if (model.editor_state) {
                            let state = model.editor_state;
                            Merge.string(Project, state, 'save_path')
                            Merge.string(Project, state, 'export_path')
                            Merge.boolean(Project, state, 'saved')
                            Merge.number(Project, state, 'added_models')
                            Merge.string(Project, state, 'mode')
                            Merge.string(Project, state, 'tool')
                            Merge.string(Project, state, 'display_uv')
                            Merge.boolean(Project, state, 'exploded_view')
                            if (state.uv_viewport) {
                                Merge.number(Project.uv_viewport, state.uv_viewport, 'zoom')
                                Merge.arrayVector2(Project.uv_viewport = state.uv_viewport, 'offset');
                            }
                            if (state.previews) {
                                for (let id in state.previews) {
                                    Project.previews[id] = state.previews[id];
                                }
                            }
                            state.selected_elements.forEach((uuid: string) => {
                                let el = Outliner.elements.find(el2 => el2.uuid == uuid);
                                if (Project && el)
                                    Project.selected_elements.push(el);
                            })
                            Group.multi_selected.push(state.selected_group && Group.all.find(g => g.uuid == state.selected_group));
                            (state.selected_texture && Texture.all.find(t => t.uuid == state.selected_texture))?.select();

                            Project.loadEditorState();
                        }
                    },
                    afterDownload(path) {
                        logger("After Download...");
                        if (!Project) {
                            return
                        }
                        if (this.remember) {
                            Project.saved = true;
                        }
                        Blockbench.showQuickMessage(
                            tl("message.save_file", [
                                path ? pathToName(path, true) : this.fileName!(),
                            ])
                        );
                    },
                    afterSave(path) {
                        logger("After Save...");
                        if (!Project) {
                            return
                        }
                        var name = pathToName(path, true);
                        if (Format.codec == Codecs[identifer] || Codecs[identifer].id == "project") {
                            if (Codecs[identifer].id == "project") {
                                Project.save_path = path;
                            } else {
                                Project.export_path = path;
                            }
                            Project.name = pathToName(path, false);
                            Project.saved = true;
                        }
                        Settings.updateSettingsInProfiles();
                        if (this.remember) {
                            addRecentProject({
                                name,
                                path: path,
                                icon: Format.icon,
                            });
                            updateRecentProjectThumbnail();
                        }
                        Blockbench.showQuickMessage(tl("message.save_file", [name]));
                    },
                    export_action: new Blockbench.Action("export_admodel", {
                        name: "Export ADModel",
                        description: "Export Animated Display Model",
                        icon: "star",
                        category: "file",
                        click() {
                            Codecs[identifer].export();
                        },
                    })
                });
                if (Codecs.hasOwnProperty(identifer)) {
                    registered.push(Codecs[identifer]);
                    logger("Registered Codec Successfully:", identifer);
                } else {
                    throw TypeError("Something went wrong! Codec can't be registered:" + identifer);
                }
            } else {
                registered.push(Codecs[identifer]);
                logger("Already registered. Skipping Codec register:", identifer);
            }

            logger("Checking Formats...");
            const main_codec = Codecs[identifer]
            if (!Formats.hasOwnProperty(identifer)) {
                logger("The Format have not registered yet");
                logger("Attepting to register the Format:", identifer);

                new Blockbench.ModelFormat({
                    id: identifer,
                    icon: "animation",
                    name: "Animated Display",
                    category: "minecraft",
                    target: [
                        "Minecraft: Java Edition",
                    ],
                    condition: () => true,
                    show_on_start_screen: true,
                    codec: main_codec,

                    box_uv: true,
                    optional_box_uv: true,
                    single_texture: false,
                    model_identifier: true,
                    parent_model_id: false,
                    vertex_color_ambient_occlusion: true,
                    animated_textures: true,
                    bone_rig: true,
                    centered_grid: true,
                    rotate_cubes: true,
                    integer_size: false,
                    meshes: false,
                    texture_meshes: false,
                    locators: true,
                    rotation_limit: true,
                    uv_rotation: true,
                    rotation_snap: true,
                    java_face_properties: false,
                    select_texture_for_particles: false,
                    bone_binding_expression: true,
                    animation_files: false,
                    texture_folder: false,
                    edit_mode: true,
                    paint_mode: false,
                    display_mode: false,
                    animation_mode: true,
                    pose_mode: false,
                });

                if (Formats.hasOwnProperty(identifer)) {
                    logger("Registered Format Successfully:", identifer);
                    main_codec.format = Formats[identifer];
                    registered.push(Formats[identifer]);
                } else {
                    throw TypeError("Something went wrong! Format can't be registered:" + identifer);
                }
            } else {
                registered.push(Formats[identifer]);
                logger("Already registered. Skipping Format register:", identifer);
            }
            const main_format = Formats[identifer]

            const action = new Blockbench.Action("export_admodel_as_json", {
                name: "Export ADModel as multi-JSON",
                description: "Export Animated Display Model as multi-JSON",
                icon: "star",
                category: "file",
                click() {
                    const animation_frames: { [animation_name: string]: frame[] } = {};

                    Blockbench.Animation.all.forEach((animation) => {
                        const animation_length = animation.length; // In seconds
                        const frames: frame[] = [];

                        // Generate frames every 0.25 seconds
                        for (let now_time = 0; now_time <= animation_length; now_time += 0.05) {
                            frames.push(generate(now_time));
                        }

                        function generate(now_time: number) {
                            /**
                             * key is Node's UUID
                             */
                            const rotation: { [uuid: string]: { x?: number; y?: number; z?: number; }; } = {};
                            /**
                             * key is Node's UUID
                             */
                            const position: { [uuid: string]: { x?: number; y?: number; z?: number; }; } = {};

                            /**
                             * key is Node's UUID
                             */
                            const scale: { [uuid: string]: { x?: number; y?: number; z?: number; }; } = {};

                            Group.all.forEach(node => {
                                const boneAnimator = animation.getBoneAnimator(node)
                                Animator.resetLastValues();
                                if (animation.loop == 'once' && now_time > animation.length && animation.length) {
                                    return;
                                }
                                let multiplier = animation.blend_weight ? Math.clamp(Animator.MolangParser.parse(animation.blend_weight), 0, Infinity) : 1;

                                const rotations_array = boneAnimator.interpolate('rotation');
                                if (rotations_array) {
                                    rotation[node.uuid] = {}
                                    rotations_array.forEach((n, i) => {
                                        // Calculate the rotation at the current time
                                        const keyframe_rotation = calculateKeyframeValue(boneAnimator.keyframes, 'rotation', now_time)[i];
                                        rotation[node.uuid][getAxisLetter(i)] = node.rotation[i] + Math.degToRad(keyframe_rotation) * (i == 2 ? 1 : -1) * multiplier;
                                    })
                                }


                                const position_array = boneAnimator.interpolate('position');
                                if (position_array) {
                                    position[node.uuid] = {}
                                    const keyframe_position = calculateKeyframeValue(boneAnimator.keyframes, 'position', now_time);
                                    position[node.uuid].x = node.origin[0] - keyframe_position[0] * multiplier;
                                    position[node.uuid].y = node.origin[1] + keyframe_position[1] * multiplier;
                                    position[node.uuid].z = node.origin[2] + keyframe_position[2] * multiplier;
                                }

                                // const scale_array = boneAnimator.interpolate('scale');
                                // if (scale_array){
                                //     scale[node.uuid] = {}
                                //     const keyframe_scale = calculateKeyframeValue(boneAnimator.keyframes, 'scale', now_time);
                                //     scale[node.uuid].x = node.scale[0] * ((1 + (keyframe_scale[0] - 1) * multiplier) || 0.00001);
                                //     scale[node.uuid].y = node.scale[1] * ((1 + (keyframe_scale[1] - 1) * multiplier) || 0.00001);
                                //     scale[node.uuid].z = node.scale[2] * ((1 + (keyframe_scale[2] - 1) * multiplier) || 0.00001);
                                // }
                            });

                            return {
                                rotation,
                                position,
                                scale
                            }
                        }

                        animation_frames[animation.name] = frames
                    })
                    const base: {
                        [uuid: string]: {
                            rotation: ArrayVector3,
                            origin: ArrayVector3
                        }
                    } = {}
                    Group.all.forEach(group => {
                        base[group.uuid] = {
                            rotation: structuredClone(group.rotation),
                            origin: structuredClone(group.origin),
                        }
                    })
                    console.log(base);
                    Object.entries(animation_frames).forEach((val) => {
                        const animation_name = val[0];
                        const frames = val[1];
                        for (let i = 0; i < frames.length; i++) {
                            const frame = frames[i];
                            Group.all.forEach(group => {
                                if (group.parent === "root") {
                                    return;
                                }
                                group.rotation[0] = (frame.rotation[group.uuid]?.x ?? 0) + (base[group.uuid].rotation[0] ?? 0)
                                group.rotation[1] = (frame.rotation[group.uuid]?.y ?? 0) + (base[group.uuid].rotation[1] ?? 0)
                                group.rotation[2] = (frame.rotation[group.uuid]?.z ?? 0) + (base[group.uuid].rotation[2] ?? 0)
                                console.log(group.rotation);
                                group.origin[0] = (frame.position[group.uuid]?.x ?? 0) + (base[group.uuid].origin[0] ?? 0)
                                group.origin[1] = (frame.position[group.uuid]?.y ?? 0) + (base[group.uuid].origin[1] ?? 0)
                                group.origin[2] = (frame.position[group.uuid]?.z ?? 0) + (base[group.uuid].origin[2] ?? 0)
                                console.log(group.origin);
                            });
                            const copy = JSON.parse(Codecs["java_block"].compile());
                            Group.all.forEach(group => {
                                if (group.parent !== "root") {
                                    return;
                                }
                                console.log(copy.display)
                                if (!copy.display)
                                    copy.display = {}
                                if (!copy.display.firstperson_righthand)
                                    copy.display.firstperson_righthand = {}
                                if (!copy.display.firstperson_righthand.translation)
                                    copy.display.firstperson_righthand.translation = [0, 0, 0]
                                if (!copy.display.firstperson_righthand.rotation)
                                    copy.display.firstperson_righthand.rotation = [0, 0, 0]
                                if (!copy.display.firstperson_righthand.scale)
                                    copy.display.firstperson_righthand.scale = [1, 1, 1]
                                console.log(copy.display);

                                copy.display.firstperson_righthand.translation[0] += frame.position[group.uuid]?.x ?? 0
                                copy.display.firstperson_righthand.translation[1] += frame.position[group.uuid]?.y ?? 0
                                copy.display.firstperson_righthand.translation[2] += frame.position[group.uuid]?.z ?? 0
                                copy.display.firstperson_righthand.rotation[0] += frame.rotation[group.uuid]?.x ?? 0
                                copy.display.firstperson_righthand.rotation[1] += frame.rotation[group.uuid]?.y ?? 0
                                copy.display.firstperson_righthand.rotation[2] += frame.rotation[group.uuid]?.z ?? 0
                                copy.display.firstperson_righthand.scale[0] += frame.scale[group.uuid]?.x ?? 0
                                copy.display.firstperson_righthand.scale[1] += frame.scale[group.uuid]?.y ?? 0
                                copy.display.firstperson_righthand.scale[2] += frame.scale[group.uuid]?.z ?? 0
                                console.log(copy.display.firstperson_righthand);
                            });

                            Blockbench.export({
                                resource_id: "animated_display.export_json",
                                type: "json",
                                extensions: ["json"],
                                name: Codecs["ADModel"].fileName!() + "." + animation_name + "." + i + ".json",
                                startpath: Codecs["ADModel"].startPath!(),
                                content: JSON.stringify(copy),
                            });
                        }

                    });

                    Group.all.forEach(group => {
                        if (group.parent === "root") {
                            return;
                        }
                        group.rotation[0] = base[group.uuid].rotation[0]
                        group.rotation[1] = base[group.uuid].rotation[1]
                        group.rotation[2] = base[group.uuid].rotation[2]

                        group.origin[0] = base[group.uuid].origin[0]
                        group.origin[1] = base[group.uuid].origin[1]
                        group.origin[2] = base[group.uuid].origin[2]
                    });
                },
            })

            const condition = () => Format === main_format
            const bar_menu = new BarMenu("AnimatedDisplay", [action], {
                condition,
                name: "Animated Display"
            });

            /**
             * 
             * @param {string} id 
             * @param {ValidatorCheckOptions} options Option!
             */
            function Validator_register(id: string, options: ValidatorCheckOptions) {
                const searched_result = Validator.checks.filter(ValidatorChecker => ValidatorChecker.id === id)
                if (0 === searched_result.length) {
                    logger("The ValidatorCheck have not registered yet");
                    logger("Attepting to register the ValidatorCheck:", id);

                    new ValidatorCheck(id, options)

                    const searched_result = Validator.checks.filter(ValidatorChecker => ValidatorChecker.id === id)
                    if (1 <= searched_result.length) {
                        registered.push(searched_result[0])
                        logger("Registered Format Successfully:", id);
                    } else {
                        throw TypeError("Something went wrong! Format can't be registered:" + id);
                    }
                } else {
                    registered.push(searched_result[0])
                    logger("Already registered. Skipping ValidatorCheck register:", id);
                }
            }

            Validator_register("check_is_root_folder_is_only_one", {
                update_triggers: ["finish_edit"],
                run() {
                    logger("Verifiying Root...");
                    const root_groups = Group.all.filter(e => e.parent === "root");
                    // Check is it only one.
                    if (root_groups.length > 1) {
                        this.fail({
                            message: "Root folder is not only one",
                            buttons: [
                                {
                                    name: "Check",
                                    icon: "edit_note",
                                    click() {
                                        Validator.dialog.hide();
                                        Modes.options.edit.select();
                                    },
                                },
                            ],
                        });
                    }
                    if (root_groups.length === 0) {
                        this.fail({
                            message: "Root folder is needed",
                            buttons: [
                                {
                                    name: "Check",
                                    icon: "edit_note",
                                    click() {
                                        Validator.dialog.hide();
                                        Modes.options.edit.select();
                                    },
                                },
                            ],
                        });
                    }
                },
                condition: () => Project?.format === Formats[identifer]
            });

            Validator_register("check_rotation_is_dividable", {
                update_triggers: ["edit_animation_properties", "edit_animation_controller_properties", "display_animation_frame"],
                run() {
                    logger("Verifiying Groups...");
                    Group.all.forEach((group) => {
                        if (group.parent === "root") {
                            return
                        }
                        AnimationItem.all.forEach(animation => {
                            animation.getBoneAnimator(group).keyframes.forEach(keyframe => {
                                if (keyframe.channel === "rotations") {
                                    return;
                                }
                                keyframe.data_points.forEach(data_point => {
                                    if (Number(data_point.x) % 22.5 !== 0 || Number(data_point.y) % 22.5 !== 0 || (Number(data_point.z) % 22.5 !== 0))
                                        this.fail({
                                            message: `Rotation are not dividable by 22.5`,
                                            buttons: [
                                                {
                                                    name: "Check",
                                                    icon: "edit_note",
                                                    click() {
                                                        Validator.dialog.hide();
                                                        group.select()
                                                    },
                                                },
                                            ],
                                        });
                                });
                            })
                        })
                    })
                },
                condition: () => Project?.format === Formats[identifer]
            })
            registered.push(action)
            registered.push(bar_menu)
        },
        onunload: () => {
            logger("Unloading...");
            registered.forEach((register) => {
                register.delete();
            });
        }
    });

    /**
     * Calculates the interpolated value of a keyframe channel at a given time.
     * @param keyframes The array of keyframes.
     * @param channel The channel name ('rotation', 'position', 'scale').
     * @param time The time to interpolate at.
     * @param axisIndex Optional: The axis index (0 for x, 1 for y, 2 for z) for rotation.
     * @returns The interpolated value.
     */
    function calculateKeyframeValue(keyframes: _Keyframe[], channel: string, time: number): number[] {
        const relevantKeyframes = keyframes.filter(kf => kf.channel === channel);

        if (relevantKeyframes.length === 0) {
            // No keyframes for this channel, return default values
            if (channel === 'rotation') return [0, 0, 0];
            if (channel === 'position') return [0, 0, 0];
            if (channel === 'scale') return [1, 1, 1];
        }

        // Find the keyframes before and after the current time
        let beforeKeyframe: _Keyframe | null = null;
        let afterKeyframe: _Keyframe | null = null;

        for (let i = 0; i < relevantKeyframes.length; i++) {
            if (relevantKeyframes[i].time <= time) {
                beforeKeyframe = relevantKeyframes[i];
            }
            if (relevantKeyframes[i].time > time) {
                afterKeyframe = relevantKeyframes[i];
                break;
            }
        }

        if (!beforeKeyframe) {
            // Time is before the first keyframe, return the first keyframe's value
            if (channel === 'rotation') {
                return [
                    Number(afterKeyframe?.data_points[0]?.x) || 0,
                    Number(afterKeyframe?.data_points[0]?.y) || 0,
                    Number(afterKeyframe?.data_points[0]?.z) || 0
                ];
            }
            return [
                Number(afterKeyframe?.data_points[0]?.x) || 0,
                Number(afterKeyframe?.data_points[0]?.y) || 0,
                Number(afterKeyframe?.data_points[0]?.z) || 0
            ];
        }

        if (!afterKeyframe) {
            // Time is after the last keyframe, return the last keyframe's value
            if (channel === 'rotation') {
                return [
                    Number(beforeKeyframe?.data_points[0]?.x) || 0,
                    Number(beforeKeyframe?.data_points[0]?.y) || 0,
                    Number(beforeKeyframe?.data_points[0]?.z) || 0
                ];
            }
            return [
                Number(beforeKeyframe?.data_points[0]?.x) || 0,
                Number(beforeKeyframe?.data_points[0]?.y) || 0,
                Number(beforeKeyframe?.data_points[0]?.z) || 0
            ];
        }

        // Interpolate between the two keyframes
        const timeDiff = afterKeyframe.time - beforeKeyframe.time;
        const timeSinceBefore = time - beforeKeyframe.time;
        const t = timeDiff === 0 ? 0 : timeSinceBefore / timeDiff; // Avoid division by zero

        if (channel === 'rotation') {
            const beforeValue = [
                Number(beforeKeyframe.data_points[0]?.x) || 0,
                Number(beforeKeyframe.data_points[0]?.y) || 0,
                Number(beforeKeyframe.data_points[0]?.z) || 0
            ];
            const afterValue = [
                Number(afterKeyframe.data_points[0]?.x) || 0,
                Number(afterKeyframe.data_points[0]?.y) || 0,
                Number(afterKeyframe.data_points[0]?.z) || 0
            ];
            return [
                beforeValue[0] + (afterValue[0] - beforeValue[0]) * t,
                beforeValue[1] + (afterValue[1] - beforeValue[1]) * t,
                beforeValue[2] + (afterValue[2] - beforeValue[2]) * t,
            ];
        } else {
            const beforeValue = [
                Number(beforeKeyframe.data_points[0]?.x) || 0,
                Number(beforeKeyframe.data_points[0]?.y) || 0,
                Number(beforeKeyframe.data_points[0]?.z) || 0
            ];
            const afterValue = [
                Number(afterKeyframe.data_points[0]?.x) || 0,
                Number(afterKeyframe.data_points[0]?.y) || 0,
                Number(afterKeyframe.data_points[0]?.z) || 0
            ];
            return [
                beforeValue[0] + (afterValue[0] - beforeValue[0]) * t,
                beforeValue[1] + (afterValue[1] - beforeValue[1]) * t,
                beforeValue[2] + (afterValue[2] - beforeValue[2]) * t,
            ];
        }

    }
})();
