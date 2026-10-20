import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePython,pythonExecutable} from '../scripts/noapi-common.mjs';
test('python override',()=>assert.deepEqual(resolvePython({NOAPI_PYTHON:'/custom/python'}),['/custom/python']));
test('default launcher',()=>assert.ok(resolvePython({}).length));
test('Windows venv',()=>assert.match(pythonExecutable('/tmp/env','win32'),/python.exe$/));
