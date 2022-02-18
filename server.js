const Koa = require('koa')
const os = require('os')
const dotenv = require('dotenv')
const escapeHtml = require('escape-html')
const childProcess = require('child_process')
const commands = require('./commands')

const promisifyChildProcessCommand = cmd => {
  return new Promise((resolve, reject) => {
    cmd.addListener("error", reject);
    cmd.addListener("exit", resolve);
  })
}

const start = async () => {
  let startTime = Date.now()

  dotenv.config()
  const { PORT = 3000, GITHUB_ACCESS_TOKEN, GITHUB_ORG_NAME, MOST_RECENT_PRS_COUNT } = process.env

  const downloadDataScript = childProcess.exec('node ./scripts/download-all-data')
  const printChildProcessOutput = (name, output) => output.split(os.EOL).map(line => line && console.log('['+ name +'] '+ line.trim()))
  downloadDataScript.stdout.on('data', output => printChildProcessOutput('download-data', output))
  downloadDataScript.stderr.on('data', output => printChildProcessOutput('download-data', output))
  await promisifyChildProcessCommand(downloadDataScript)
  console.log('action=ensure-required-data-is-downloaded duration='+ (Date.now() - startTime) +'ms')

  startTime = Date.now()
  const orgRepos = await commands.loadData({ key: 'organizations/'+ GITHUB_ORG_NAME + '/repositories', accessToken: GITHUB_ACCESS_TOKEN })

  const orgReposPullRequests = {}
  const getPullsResults = await Promise.all(
    orgRepos.data.map(orgRepo => commands.loadData({
      key: 'organizations/'+ GITHUB_ORG_NAME +'/repositories/'+ orgRepo.name +'/pull-requests',
      accessToken: GITHUB_ACCESS_TOKEN
    }))
  )
  getPullsResults.map((result, i) => orgReposPullRequests[orgRepos.data[i].name] = result.data)
  console.log('action=load-data-into-memory duration='+ (Date.now() - startTime) +'ms')



  const app = new Koa()


  app.use(async ctx => {
    let username

    const dissectedPath = ctx.request.path.split('/')
    if (!dissectedPath[1]) username = 'akamaozu'
    else username = dissectedPath[1]

    const boldTextInHtml = str => '<b>'+ str +'</b>'

    const payload = {
      user: boldTextInHtml(username.toLowerCase()),
      organization: boldTextInHtml(GITHUB_ORG_NAME),
      total_organization_repos: orgRepos.data.length,
      total_org_repos_with_user_prs: 0,
      repos_with_user_prs: {}
    }

    orgRepos.data.map(orgRepo => {
      const orgRepoPullRequests = orgReposPullRequests[orgRepo.name]
      let marked = false

      orgRepoPullRequests.map(pr => {
        if (pr.user.login.toLowerCase() !== username.toLowerCase()) return

        if (!marked) {
          payload.total_org_repos_with_user_prs += 1
          marked = true
        }

        if (!payload.repos_with_user_prs[orgRepo.name]) {
          payload.repos_with_user_prs[orgRepo.name] = {}
          payload.repos_with_user_prs[orgRepo.name].repo = boldTextInHtml(orgRepo.name)
          payload.repos_with_user_prs[orgRepo.name].language = boldTextInHtml(orgRepo.language)

          if (orgRepo.description) payload.repos_with_user_prs[orgRepo.name].description = boldTextInHtml(orgRepo.description)

          payload.repos_with_user_prs[orgRepo.name].total_user_prs = 0

          if (username.toLowerCase() === 'akamaozu') {
            switch (orgRepo.name) {
              case 'caresix-web':
                payload.repos_with_user_prs[orgRepo.name].user_notes = [
                  'Description: ' + boldTextInHtml('Consumer Banking App in Niche Business Vertical'),
                  'Technologies: ' + boldTextInHtml('React, Redux, Tailwind CSS, Node.js, Koa, Cypress, Storybook, Auth0, HubSpot'),
                  'Responsibilities:',
                  ' - ' + boldTextInHtml('Convert Sketch layouts to React Components and App Views for Invitation Workflow'),
                  '   Example PRs: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/274') + ' target="_blank">Lead Adds Insider</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/283') + ' target="_blank">Insider Enters Personal Details</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/361') + ' target="_blank">Insider Answers KYC Conditional Questions</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/300') + ' target="_blank">Lead Adds Team Member</a>',
                  ' - ' + boldTextInHtml('Prepare and Present Some Enrollment Workflows to Client'),
                  '   Example PRs: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/395') + ' target="_blank">Insider Enrollment Demo Prep</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/405') + ' target="_blank">Implement Insider Enrollment Feedback</a>',
                  ' - ' + boldTextInHtml('Integrate third-party functionalities'),
                  '   Example PRs: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/692') + ' target="_blank">HubSpot Chatbot</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/783') + ' target="_blank">Netspend Dispute Transactions Microapp</a>',
                  ' - ' + boldTextInHtml('Investigate and Resolve Complicated Bugs'),
                  '   Example PRs: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/760') + ' target="_blank">Fix SVG Glitch in Safari</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/738') + ' target="_blank">Fix SMS Notifications</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/caresix-web/pull/731') + ' target="_blank">Fix Double Login Bug</a>',
                ]
                break

              case 'studentapp-middleware':
                payload.repos_with_user_prs[orgRepo.name].user_notes = [
                  'Description: ' + boldTextInHtml('R&P Internal Product for Education Sector'),
                  'Technologies: ' + boldTextInHtml('Node.js, AWS Lambda, AWS CloudFormation, Salesforce, Auth0'),
                  'Responsibilities:',
                  ' - ' + boldTextInHtml('Implement Architecture via CloudFormation Stacks'),
                  '   Example PRs: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/studentapp-middleware/pull/1') + ' target="_blank">Deploy With Nested CloudFormation</a>, <a href='+ escapeHtml('https://github.com/RobotsAndPencils/studentapp-middleware/pull/2') + ' target="_blank">Nested CloudFormation Stacks</a>',
                  ' - ' + boldTextInHtml('Restrict API Route Access to Auth0 Identities'),
                  '   Example PR: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/studentapp-middleware/pull/10') + ' target="_blank">Lambda Authorization based on Identity Provider</a>',
                  ' - ' + boldTextInHtml('Connect to Salesforce'),
                  '   Example PR: <a href='+ escapeHtml('https://github.com/RobotsAndPencils/studentapp-middleware/pull/3') + ' target="_blank">Connect Middleware APIs to Salesforce data-stores</a>',
                ]
                break
            }
          }

          payload.repos_with_user_prs[orgRepo.name].most_recent_user_prs = []
        }

        payload.repos_with_user_prs[orgRepo.name].total_user_prs += 1

        if (payload.repos_with_user_prs[orgRepo.name].most_recent_user_prs.length < parseInt(MOST_RECENT_PRS_COUNT)) {
          payload.repos_with_user_prs[orgRepo.name].most_recent_user_prs.push({
            title: escapeHtml(pr.title),
            url: '<a href='+ escapeHtml(pr.html_url) +' target='+ escapeHtml('_blank') +'>'+ escapeHtml(pr.html_url) + '</a>',
            created: pr.created_at,
            state: pr.merged_at ? 'merged' : pr.state,
          })
        }
      })
    })

    ctx.body = ''
      + '<!doctype html>'
      + '<head>'
      +   '<title>GitHub Organizaton Explorer</title>'
      + '</head>'
      + '<body>'
        + '<pre>'+ JSON.stringify(payload, null, 2) +'</pre>'
      + '</body>'
  });

  app.listen(PORT)
  console.log('action=server-listen port='+ PORT)
}

start()