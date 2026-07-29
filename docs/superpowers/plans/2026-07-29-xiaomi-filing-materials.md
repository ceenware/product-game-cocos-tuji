# Xiaomi Filing Materials Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce complete, template-compliant Xiaomi filing materials for 《勇者火线突围》 and stage the exact files needed for resubmission.

**Architecture:** Rebuild the filing form from Xiaomi's current original `.doc` template instead of editing the rejected free-form document. Preserve the template's table and report section structure, reuse verified company/game data and screenshots, render to PDF for page-by-page QA, and place all upload-ready materials in a new versioned folder.

**Tech Stack:** Microsoft Word/LibreOffice conversion, Python `python-docx`, Poppler PDF rendering, Pillow/image inspection, SHA-256 verification.

---

### Task 1: Establish Clean Material Inputs

**Files:**
- Source: `/Users/vicky/Documents/勇者火线突围/tmp/xiaomi_filing_template_20260729/游戏备案申请模板/小游戏作品备案申请表-填写模板.doc`
- Reference: `/Users/vicky/Documents/勇者火线突围/tmp/xiaomi_filing_template_20260729/游戏备案申请模板/小游戏作品备案申请表-参考示例.doc`
- Source data: `/Users/vicky/Documents/勇者火线突围/小米重新提交材料_v3/03_备案与资质/勇者火线突围_小游戏作品备案申请表_小米最新模板_待签章.docx`
- Output directory: `/Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/`

- [ ] **Step 1: Load the document and PDF workspace dependencies**

Use the bundled document tooling before editing or rendering the Word file.

- [ ] **Step 2: Convert both Xiaomi `.doc` files to `.docx` without editing the originals**

Run:

```bash
soffice --headless --convert-to docx --outdir /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_filing_template_20260729/converted /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_filing_template_20260729/游戏备案申请模板/小游戏作品备案申请表-填写模板.doc /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_filing_template_20260729/游戏备案申请模板/小游戏作品备案申请表-参考示例.doc
```

Expected: two editable `.docx` files with the original tables, headings, pagination, and footer regions intact.

- [ ] **Step 3: Create the versioned output directory and copy immutable supporting credentials**

Run:

```bash
mkdir -p /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质
cp /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v3/03_备案与资质/完整两页电子版权认证证书_R20260000085081.pdf /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/
cp /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v3/03_备案与资质/电子版权认证证书_完整两页合并上传.jpg /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/
cp /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v3/03_备案与资质/营业执照_巴中宜辰网络科技有限公司_上传.jpg /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/
```

Expected: the complete two-page copyright certificate and business-license image are unchanged copies.

### Task 2: Rebuild The Filing Form In The Official Template

**Files:**
- Create: `/Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/勇者火线突围_小游戏作品备案申请表_小米最新模板.docx`
- Modify from: converted official filling template
- Reuse screenshots: `/Users/vicky/Documents/勇者火线突围/小米重新提交材料_v3/02_图片视频/`

- [ ] **Step 1: Populate the verified identity fields without changing the official table structure**

Use these exact values where the template requests them:

```text
游戏名称：勇者火线突围
小米小游戏包名：com.yongzhe.huoxiantuwei.mini
运营主体：巴中宜辰网络科技有限公司
联系人：冉启燕
联系邮箱：vicky@ceenmobi.com
```

Copy any registration number, address, phone, copyright owner, and certificate number only from the existing business license, complete copyright certificate, and prior filled form; do not infer or invent administrative data.

- [ ] **Step 2: Preserve every required report heading in the original order**

The output document must contain these literal headings:

```text
基础介绍
核心玩法/游戏规则
游戏系统
游戏申请的审读意见
```

- [ ] **Step 3: Write the gameplay content under the correct headings**

```text
基础介绍：玩家控制角色在关卡场景中移动并自动攻击来袭敌人，通过完成关卡目标推进游戏进度。

核心玩法/游戏规则：进入关卡后，玩家通过触摸或滑动控制角色移动；角色在攻击范围内自动攻击敌人。玩家需要躲避敌人攻击、合理利用场景和武器，在生命值耗尽前完成关卡目标。关卡结束后根据结果进入结算或重新挑战。

游戏系统：游戏包含关卡系统、角色与生命值系统、武器与攻击系统、敌人生成与战斗系统、奖励结算系统、签到系统、转盘系统、设置与隐私政策入口。关卡系统记录当前进度；战斗系统处理移动、自动攻击、敌人受击和角色受伤；结算系统处理胜负结果和奖励。

游戏申请的审读意见：经审读，游戏内容为休闲射击闯关玩法，不含法律法规禁止内容；游戏内文字、图片、音视频和交互内容已按提交版本进行检查，申请单位承诺提交材料真实、完整并与上线版本一致。
```

- [ ] **Step 4: Insert distinct, readable screenshots in gameplay order**

Use at least these distinct images:

```text
01_portrait_1080x1920.jpg：首次进入或首页
02_portrait_1080x1920.jpg：关卡操作/战斗
03_portrait_1080x1920.jpg：不同战斗阶段或系统界面
04_portrait_1080x1920.jpg：关卡结果或其他核心系统
```

Each screenshot must have a short step caption and must not duplicate another image.

- [ ] **Step 5: Keep the bottom application-unit stamp area blank**

The text and line following `申请单位（盖章）` must not contain the company name, a typed signature, a pasted stamp, or an underline entry. Fill only the date field permitted by the Xiaomi example. Preserve a separate personal signature only where the template explicitly asks for the responsible person's signature.

### Task 3: Render And Inspect Every Page

**Files:**
- Create: `/Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/勇者火线突围_小游戏作品备案申请表_小米最新模板.pdf`
- Generated QA images: `/Users/vicky/Documents/勇者火线突围/tmp/xiaomi_filing_qa/pages/`

- [ ] **Step 1: Render the DOCX to PDF using the document skill workflow**

Expected: the official basic-information table is not split by a large blank page, headings remain attached to their content, and all screenshots fit inside page margins.

- [ ] **Step 2: Render every PDF page to PNG at readable resolution**

Run:

```bash
mkdir -p /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_filing_qa/pages
pdftoppm -png -r 150 /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/勇者火线突围_小游戏作品备案申请表_小米最新模板.pdf /Users/vicky/Documents/勇者火线突围/tmp/xiaomi_filing_qa/pages/page
```

Expected: one PNG per PDF page.

- [ ] **Step 3: Visually inspect every rendered page**

Reject and regenerate the document if any page has clipped text, overlapping text, unreadable screenshots, duplicated screenshots, excessive blank space, missing headings, a filled application-unit stamp area, or a table broken across pages incorrectly.

- [ ] **Step 4: Verify the PDF text contains all required headings and no placeholder markers**

Run:

```bash
pdftotext /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/勇者火线突围_小游戏作品备案申请表_小米最新模板.pdf - | rg "基础介绍|核心玩法/游戏规则|游戏系统|游戏申请的审读意见"
pdftotext /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/勇者火线突围_小游戏作品备案申请表_小米最新模板.pdf - | rg "待补充|请填写|示例文字" && exit 1 || true
```

Expected: all four headings are present and no placeholder marker is found.

### Task 4: Assemble And Verify The Upload Set

**Files:**
- Verify: `/Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/完整两页电子版权认证证书_R20260000085081.pdf`
- Verify: `/Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/电子版权认证证书_完整两页合并上传.jpg`
- Verify: `/Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/勇者火线突围_小游戏作品备案申请表_小米最新模板.pdf`

- [ ] **Step 1: Verify page count, image dimensions, readability, and checksums**

Run:

```bash
pdfinfo /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/完整两页电子版权认证证书_R20260000085081.pdf
sips -g pixelWidth -g pixelHeight /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/电子版权认证证书_完整两页合并上传.jpg
shasum -a 256 /Users/vicky/Documents/勇者火线突围/小米重新提交材料_v5/03_备案与资质/*
```

Expected: certificate PDF has two pages; merged certificate image is `1190 x 3396`; all files open successfully and have stable SHA-256 values.

- [ ] **Step 2: Upload only after the runtime RPKS plan has also passed**

Use the in-app browser to replace the rejected copyright certificate, filing form, and RPKS. Recheck all page validation messages after each upload.

- [ ] **Step 3: Stop before the final submission action**

Present the completed upload checklist and obtain explicit user confirmation immediately before clicking `提交审核`.
